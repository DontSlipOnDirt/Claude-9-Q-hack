import os
from pathlib import Path

import uvicorn

REPO_ROOT = Path(__file__).resolve().parent


def main() -> None:
    # Reload picks up new routes (e.g. recurring-manual) without a manual restart.
    reload = os.environ.get("PICNIC_API_RELOAD", "1").lower() not in ("0", "false", "no")
    kw: dict = {
        "host": "127.0.0.1",
        "port": 8000,
        "reload": reload,
    }
    if reload:
        kw["reload_dirs"] = [str(REPO_ROOT)]
    uvicorn.run("backend.main:app", **kw)


if __name__ == "__main__":
    main()
