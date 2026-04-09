from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
# Aligned with backend.backend and scripts/build_sqlite_db.py output
DB_PATH = ROOT_DIR / "picnic_data.db"
FRONTEND_DIR = ROOT_DIR / "frontend"
ROOT_ENV_PATH = ROOT_DIR / ".env"
OPENAI_ENV_PATH = ROOT_DIR / "openai.env"
