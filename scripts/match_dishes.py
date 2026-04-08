#!/usr/bin/env python3
"""Match a natural-language dish query to recipes using recipes.csv and OpenAI."""

import argparse
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


def build_prompt(recipes_csv: str, user_query: str) -> str:
    return f"""You are helping someone pick dishes from a fixed catalog.

The catalog is a CSV with columns: id,name,portion_quantity,cook_time,description
Each row is one dish (recipe).

--- recipes.csv ---
{recipes_csv.strip()}
--- end catalog ---

User is looking for dishes that match this description (cuisine, ingredients, style, constraints, etc.):
"{user_query}"

Task:
- Pick every dish from the catalog that plausibly matches what the user wants. Include close matches (same protein + starch + region/style) even if not a perfect keyword match.
- Order results from best match to weaker match.
- If nothing fits well, return an empty matches list.

Respond with a single JSON object (no markdown fences) with this exact shape:
{{"matches":[{{"id":"<uuid from catalog>","name":"<name from catalog>","reason":"<one short sentence why it fits>"}}]}}
"""


def call_openai(api_key: str, model: str, user_content: str) -> dict:
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": user_content}],
        "max_tokens": 2000,
        "response_format": {"type": "json_object"},
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        body_text = resp.read().decode("utf-8", errors="replace")
    parsed = json.loads(body_text)
    content = (
        parsed.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not content.strip():
        raise RuntimeError(f"Empty assistant message: {body_text}")
    return json.loads(content)


def main() -> int:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_env_file(os.path.join(repo_root, "openai.env"))

    parser = argparse.ArgumentParser(
        description="Find dishes in recipes.csv that match a natural-language query (via OpenAI)."
    )
    parser.add_argument(
        "query",
        nargs="?",
        help='What the user wants (e.g. "Sweet and sour chicken maybe in asian style, with rice")',
    )
    parser.add_argument(
        "-m",
        "--model",
        default=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        help="Chat model (default: env OPENAI_MODEL or gpt-4o-mini)",
    )
    args = parser.parse_args()

    user_query = (args.query or "").strip()
    if not user_query:
        parser.print_help()
        print(
            "\nError: pass a query as the first argument, or pipe text into stdin.",
            file=sys.stderr,
        )
        if not sys.stdin.isatty():
            user_query = sys.stdin.read().strip()
        if not user_query:
            return 2

    recipes_path = os.path.join(repo_root, "data", "recipes.csv")
    if not os.path.isfile(recipes_path):
        print(f"Missing {recipes_path}", file=sys.stderr)
        return 2

    with open(recipes_path, "r", encoding="utf-8") as f:
        recipes_csv = f.read()

    prompt = build_prompt(recipes_csv, user_query)

    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        print(
            "Missing OPENAI_KEY. Set it in openai.env as OPENAI_KEY=... or export it.",
            file=sys.stderr,
        )
        return 2

    try:
        result = call_openai(api_key, args.model, prompt)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print("status:", e.code, file=sys.stderr)
        print(err_body, file=sys.stderr)
        return 1
    except Exception as e:
        print("request failed:", repr(e), file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
