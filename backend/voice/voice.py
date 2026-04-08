from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
ELEVENLABS_STT_MODEL = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
ELEVENLABS_TTS_MODEL = "eleven_turbo_v2_5"

CONVERSATION_DIR = Path("backend/voice/conversations")
CONVERSATION_DIR.mkdir(parents=True, exist_ok=True)

_NON_SPEECH = {
	"",
	"silence",
	"noise",
	"background noise",
	"unintelligible",
	"inaudible",
}


def normalize_command(text: str) -> str:
	normalized = re.sub(r"[^a-z\s]", "", text.lower()).strip()
	return " ".join(normalized.split())


def has_actual_words(text: str) -> bool:
	cleaned = text.strip().lower()
	if not cleaned:
		return False
	if cleaned.startswith("[") and cleaned.endswith("]"):
		return False
	if cleaned in _NON_SPEECH:
		return False
	if any(token in cleaned for token in ("background noise", "unintelligible")):
		return False

	words = re.findall(r"[a-zA-Z]{2,}", text)
	return bool(words)


def transcribe_with_elevenlabs(
	audio_bytes: bytes,
	filename: str,
	content_type: str = "audio/webm",
	timeout_seconds: int = 45,
) -> str | None:
	if not ELEVENLABS_API_KEY:
		raise RuntimeError("ELEVENLABS_API_KEY is missing in .env")

	headers = {"xi-api-key": ELEVENLABS_API_KEY}
	files = {"file": (filename, audio_bytes, content_type)}
	data = {"model_id": ELEVENLABS_STT_MODEL}

	response = requests.post(
		"https://api.elevenlabs.io/v1/speech-to-text",
		headers=headers,
		data=data,
		files=files,
		timeout=timeout_seconds,
	)
	response.raise_for_status()

	payload = response.json()
	text = str(payload.get("text", "")).strip()
	return text if has_actual_words(text) else None


def synthesize_with_elevenlabs(
	text: str,
	timeout_seconds: int = 60,
	*,
	accept_mime: str = "audio/mpeg",
	output_format: str | None = None,
) -> bytes:
	if not ELEVENLABS_API_KEY:
		raise RuntimeError("ELEVENLABS_API_KEY is missing in .env")
	if not ELEVENLABS_VOICE_ID:
		raise RuntimeError("ELEVENLABS_VOICE_ID is missing in .env")

	headers = {
		"xi-api-key": ELEVENLABS_API_KEY,
		"Content-Type": "application/json",
		"Accept": accept_mime,
	}
	body = {
		"text": text,
		"model_id": ELEVENLABS_TTS_MODEL,
		"voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
	}
	url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
	if output_format:
		url = (
			f"https://api.elevenlabs.io/v1/text-to-speech/"
			f"{ELEVENLABS_VOICE_ID}/stream?output_format={output_format}"
		)
	response = requests.post(
		url,
		headers=headers,
		json=body,
		timeout=timeout_seconds,
	)
	response.raise_for_status()
	return response.content


def log_conversation_event(
	conversation_id: str,
	role: str,
	message: str,
	*,
	extra: dict[str, Any] | None = None,
) -> None:
	if not has_actual_words(message) and role.lower() == "user":
		return

	event: dict[str, Any] = {
		"ts": datetime.now(timezone.utc).isoformat(),
		"role": role,
		"message": message,
	}
	if extra:
		event["extra"] = extra

	logfile = CONVERSATION_DIR / f"{conversation_id}.jsonl"
	with logfile.open("a", encoding="utf-8") as handle:
		handle.write(json.dumps(event, ensure_ascii=True) + "\n")
