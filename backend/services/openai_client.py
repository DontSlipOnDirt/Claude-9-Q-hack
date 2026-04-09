from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def get_openai_api_key() -> str:
    api_key = os.environ.get("OPENAI_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing OpenAI key. Set OPENAI_KEY or OPENAI_API_KEY in openai.env or .env."
        )
    return api_key


def chat_json(
    *,
    user_content: str,
    model: str | None = None,
    system_content: str | None = None,
    max_tokens: int = 2000,
) -> dict[str, Any]:
    api_key = get_openai_api_key()
    selected_model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    messages: list[dict[str, str]] = []
    if system_content:
        messages.append({"role": "system", "content": system_content})
    messages.append({"role": "user", "content": user_content})

    payload = {
        "model": selected_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body_text = resp.read().decode("utf-8", errors="replace")

    parsed = json.loads(body_text)
    content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not str(content).strip():
        raise RuntimeError(f"Empty assistant message: {body_text}")
    return json.loads(str(content))
