from __future__ import annotations

import os
import sys
import uuid
from typing import Any

from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5").strip()

print(f"DEBUG: Loaded ANTHROPIC_MODEL = {ANTHROPIC_MODEL}")
print(f"DEBUG: ROOT_DIR = {ROOT_DIR}")
print(f"DEBUG: .env path = {os.path.join(ROOT_DIR, '.env')}")

app = Flask(__name__)

if not ANTHROPIC_API_KEY:
    raise RuntimeError("Missing ANTHROPIC_API_KEY in .env")

client = Anthropic(api_key=ANTHROPIC_API_KEY)
conversations: dict[str, list[dict[str, str]]] = {}


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.post("/chat")
def chat() -> tuple[Any, int]:
    payload = request.get_json(silent=True) or {}
    query = str(payload.get("query", "")).strip()
    conversation_id = str(payload.get("conversation_id") or uuid.uuid4())
    system_prompt = str(
        payload.get(
            "system",
            "You are a concise voice assistant. Keep responses short and practical.",
        )
    ).strip()

    if not query:
        return jsonify({"error": "Missing non-empty 'query'"}), 400

    history = conversations.setdefault(conversation_id, [])
    history.append({"role": "user", "content": query})

    try:
        print(f"DEBUG: ANTHROPIC_MODEL value is: '{ANTHROPIC_MODEL}'", flush=True)
        sys.stderr.write(f"DEBUG: About to call Anthropic with model: {ANTHROPIC_MODEL}\n")
        sys.stderr.flush()
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=220,
            temperature=0.3,
            system=system_prompt,
            messages=history,
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Anthropic request failed: {exc}"}), 502

    assistant_text_parts = [
        block.text for block in response.content if getattr(block, "type", "") == "text"
    ]
    assistant_text = "\n".join(p.strip() for p in assistant_text_parts if p.strip()).strip()

    if not assistant_text:
        assistant_text = "I could not generate a response."

    history.append({"role": "assistant", "content": assistant_text})

    # Keep only recent turns to avoid unbounded growth.
    if len(history) > 20:
        conversations[conversation_id] = history[-20:]

    return jsonify(
        {
            "conversation_id": conversation_id,
            "model": ANTHROPIC_MODEL,
            "response": assistant_text,
        }
    ), 200


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002, debug=False)
