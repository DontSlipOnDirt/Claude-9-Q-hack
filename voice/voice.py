import os
from datetime import datetime
from io import BytesIO

import pyaudio
import requests
import speech_recognition as sr
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")
ELEVENLABS_STT_MODEL = os.getenv("ELEVENLABS_STT_MODEL")
MEAL_AGENT_URL = "http://127.0.0.1:5001/meal-suggestions"
MEAL_AGENT_TIMEOUT_SECONDS = 90
MEAL_AGENT_MAX_RECIPES = 20

if not ELEVENLABS_API_KEY:
    raise RuntimeError("ELEVENLABS_API_KEY is missing. Add it to .env")

# Setup logging
os.makedirs("voice/conversations", exist_ok=True)
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_FILE = os.path.join("voice/conversations", f"log_{timestamp}.txt")


def log_interaction(role, text):
    """Write conversation to the log file."""
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {role}: {text}\n")


def transcribe_with_elevenlabs(audio_data):
    """Send captured microphone audio to ElevenLabs Speech-to-Text."""
    audio_bytes = audio_data.get_wav_data(convert_rate=16000, convert_width=2)
    files = {"file": ("speech.wav", BytesIO(audio_bytes), "audio/wav")}
    data = {"model_id": ELEVENLABS_STT_MODEL}
    headers = {"xi-api-key": ELEVENLABS_API_KEY}

    response = requests.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers=headers,
        data=data,
        files=files,
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    text = payload.get("text", "").strip()
    return text or None


def speak(text):
    """Speak text with ElevenLabs TTS and play raw PCM on laptop speakers."""
    log_interaction("Agent", text)

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/pcm",
    }
    body = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
    }

    response = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream?output_format=pcm_22050",
        headers=headers,
        json=body,
        timeout=60,
    )
    response.raise_for_status()

    # ElevenLabs returns 16-bit mono PCM at 22050 Hz with pcm_22050.
    player = pyaudio.PyAudio()
    stream = player.open(format=pyaudio.paInt16, channels=1, rate=22050, output=True)
    try:
        stream.write(response.content)
    finally:
        stream.stop_stream()
        stream.close()
        player.terminate()


def listen_and_recognize():
    """Listen with local microphone, transcribe via ElevenLabs STT."""
    recognizer = sr.Recognizer()

    with sr.Microphone() as source:
        print("\n[Listening...]")
        recognizer.adjust_for_ambient_noise(source, duration=0.5)

        try:
            audio = recognizer.listen(source, timeout=6, phrase_time_limit=20)
            text = transcribe_with_elevenlabs(audio)
            if text:
                log_interaction("User", text)
            return text
        except sr.WaitTimeoutError:
            return None
        except requests.RequestException as exc:
            log_interaction("System", f"STT request failed: {exc}")
            return None

def query_meal_agent(user_input):
    """Call backend voice agent to get meal suggestions."""
    response = requests.post(
        MEAL_AGENT_URL,
        json={"query": user_input, "max_recipes": MEAL_AGENT_MAX_RECIPES},
        timeout=MEAL_AGENT_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    suggestions = (payload.get("suggestions") or "").strip()
    if suggestions:
        return suggestions
    return "I could not find a meal recommendation right now."

def main_loop():
    speak("System starting. ElevenLabs speech systems are ready.")
    
    while True:
        # 1. Listen for user input
        user_text = listen_and_recognize()
        
        if not user_text:
            continue  # Keep listening if nothing was heard or an error occurred

        normalized = user_text.lower().strip()
        if normalized in {"stop", "exit", "quit", "goodbye"}:
            speak("Goodbye!")
            break
            
        # 2. Feed text to your agent an get a response
        try:
            agent_response = query_meal_agent(user_text)
        except requests.RequestException as exc:
            log_interaction("System", f"Meal agent request failed: {exc}")
            agent_response = "I could not reach the meal planner backend. Please check if it is running."
        
        # 3. Speak the response out loud
        speak(agent_response)
        
if __name__ == '__main__':
    main_loop()

