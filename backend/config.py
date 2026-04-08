from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
# Aligned with backend.backend and CSV build output location
DB_PATH = ROOT_DIR / "data" / "picnic_data.db"
FRONTEND_DIR = ROOT_DIR / "frontend"
OPENAI_ENV_PATH = ROOT_DIR / "openai.env"
