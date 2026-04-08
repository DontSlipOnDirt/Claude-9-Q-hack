"""Minimal OpenAI Chat Completions test using OPENAI_KEY from openai.env."""

import json
import os
import sys
import urllib.error
import urllib.request


def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def main() -> int:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_env_file(os.path.join(repo_root, "openai.env"))

    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        print(
            "Missing OPENAI_KEY. Set it in openai.env as OPENAI_KEY=... or export it.",
            file=sys.stderr,
        )
        return 2

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    test_prompt = "Reply with one short sentence confirming you received this test message."

    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": test_prompt}],
        "max_tokens": 120,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body_bytes = resp.read()
            body_text = body_bytes.decode("utf-8", errors="replace")
            print("status:", resp.status)
            parsed = json.loads(body_text)
            msg = (
                parsed.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            if msg:
                print("assistant:", msg.strip())
            else:
                print("body:", body_text)
            return 0
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print("status:", e.code, file=sys.stderr)
        print(err_body, file=sys.stderr)
        return 1
    except Exception as e:
        print("request failed:", repr(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
