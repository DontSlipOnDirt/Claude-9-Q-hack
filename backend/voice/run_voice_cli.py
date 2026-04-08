from __future__ import annotations

import argparse
import uuid

from backend.config import DB_PATH
from backend.db import Db
from backend.voice.voice import (
    has_actual_words,
    log_conversation_event,
    normalize_command,
    synthesize_with_elevenlabs,
    transcribe_with_elevenlabs,
)
from backend.voice.voice_agent import GroceryVoiceAgent


def capture_mic_transcript(timeout: int, phrase_limit: int) -> str | None:
    try:
        import speech_recognition as sr
    except ImportError as exc:  # pragma: no cover - runtime guidance
        raise RuntimeError(
            "speech_recognition is not installed. Install it with: uv pip install SpeechRecognition"
        ) from exc

    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("Listening...")
        recognizer.adjust_for_ambient_noise(source, duration=0.4)
        try:
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_limit)
        except sr.WaitTimeoutError:
            return None

    wav_bytes = audio.get_wav_data(convert_rate=16000, convert_width=2)
    transcript = transcribe_with_elevenlabs(
        wav_bytes,
        filename="speech.wav",
        content_type="audio/wav",
    )
    return transcript


def play_tts(text: str) -> None:
    try:
        import pyaudio
    except ImportError as exc:
        raise RuntimeError("pyaudio is not installed. Install it with: uv pip install pyaudio") from exc

    pcm_bytes = synthesize_with_elevenlabs(
        text,
        accept_mime="audio/pcm",
        output_format="pcm_22050",
    )

    player = pyaudio.PyAudio()
    stream = player.open(format=pyaudio.paInt16, channels=1, rate=22050, output=True)
    try:
        chunk_size = 1024
        for i in range(0, len(pcm_bytes), chunk_size):
            stream.write(pcm_bytes[i : i + chunk_size])
    finally:
        stream.stop_stream()
        stream.close()
        player.terminate()


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone voice+agent runner (no frontend).")
    parser.add_argument("--customer-id", required=True, help="Customer UUID to personalize suggestions.")
    parser.add_argument(
        "--mode",
        choices=["mic", "text"],
        default="mic",
        help="mic: listen through microphone, text: type prompts manually.",
    )
    parser.add_argument("--timeout", type=int, default=8, help="Mic listen timeout in seconds.")
    parser.add_argument("--phrase-limit", type=int, default=20, help="Max phrase length for mic mode.")
    args = parser.parse_args()

    db = Db(DB_PATH)
    agent = GroceryVoiceAgent(db)
    conversation_id = str(uuid.uuid4())

    customer = db.row("SELECT id, name FROM customers WHERE id = ?", (args.customer_id,))
    if not customer:
        raise SystemExit(f"Customer not found: {args.customer_id}")

    print(f"Voice CLI started for {customer['name']} ({customer['id']})")
    print("Say/type your request. Say/type 'quit' to exit.")

    while True:
        if args.mode == "mic":
            transcript = capture_mic_transcript(args.timeout, args.phrase_limit)
            if transcript is None:
                print("No speech detected.")
                continue
        else:
            transcript = input("You: ").strip()

        if not transcript:
            continue

        if normalize_command(transcript) in {"quit", "exit", "goodbye"}:
            print("Bye.")
            break

        if not has_actual_words(transcript):
            print("Ignored non-word/noise input.")
            continue

        log_conversation_event(conversation_id, "user", transcript, extra={"customer_id": args.customer_id})

        turn = agent.run_turn(
            customer_id=args.customer_id,
            transcript=transcript,
            conversation_id=conversation_id,
        )
        spoken = str(turn.get("spoken_summary", "I can help with your basket.")).strip()
        draft = turn.get("order_draft", [])

        print(f"Agent: {spoken}")
        if draft:
            print("Draft lines:")
            for line in draft:
                sku = line.get("sku")
                qty = line.get("quantity")
                why = line.get("why")
                print(f" - {sku} x{qty} ({why})")

        log_conversation_event(
            conversation_id,
            "assistant",
            spoken,
            extra={"order_draft_items": len(draft) if isinstance(draft, list) else 0},
        )

        try:
            print("Playing response...")
            play_tts(spoken)
        except Exception as exc:
            print(f"TTS failed: {exc}")


if __name__ == "__main__":
    main()
