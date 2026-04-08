#!/usr/bin/env python3
"""Match a natural-language dish query to recipes (OpenAI). CLI wrapper around backend.services."""

import argparse
import json
import os
import sys
import urllib.error
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from backend.config import DB_PATH, OPENAI_ENV_PATH
from backend.db import Db
from backend.services.match_dishes import load_env_file, match_dishes


def main() -> int:
    load_env_file(str(OPENAI_ENV_PATH))

    parser = argparse.ArgumentParser(
        description="Find dishes that match a natural-language query (via OpenAI)."
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

    db = Db(DB_PATH)
    try:
        result = match_dishes(db, user_query, model=args.model)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 2
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
