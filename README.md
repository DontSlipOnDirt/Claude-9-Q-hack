# Claude-9-Q-hack

Picnic Q-Hack demo app with:

- SQLite data model populated from CSVs under `data/`
- FastAPI backend (`backend/main.py` — includes `match-dishes`, `shopping-basket`, and all catalog/auth routes)
- **Meal Planner Pro**–style UI: Vite + React + TypeScript in `frontend/`

## Run locally

### 1. Database

Build **`data/picnic_data.db`** from CSVs:

```bash
python scripts/build_sqlite_db.py
```

Article photos are served from **`frontend/public/catalog/{sku}.png`**. `data/articles.csv` `image_url` values use paths like `/catalog/VEG-TOM-001.png`. After changing images or `image_url`, run `python scripts/build_sqlite_db.py` so SQLite matches.

### 2. Python API

```bash
pip install -e .
# or: pip install fastapi uvicorn
python main.py
```

API: [http://127.0.0.1:8000](http://127.0.0.1:8000) · OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Frontend (development)

In a **second** terminal (Vite proxies `/api` to the Python server):

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) (or the host shown in the terminal).

### 4. Single-port production-style run

Build the SPA, then start only Python (serves `frontend/dist` + `/api`):

```bash
cd frontend && npm install && npm run build && cd ..
python main.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

### Auth demo

- **Primary demo account:** `demo@picnic.com` / `picnic123` (rebuild DB after pulling latest `customers.csv`).
- **Other seed customers:** password **`demo`** (e.g. `alex.doe@example.com`).

### Optional: AI dish matching

Add repo-root `openai.env` with `OPENAI_KEY=` (and optional `OPENAI_MODEL=`) so `POST /api/catalog/match-dishes` and the in-app **AI Meal Assistant** work.

### Optional: Voice transcription

Add repo-root `.env` values for ElevenLabs voice input:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_STT_MODEL` (defaults to `scribe_v2`)

The AI panel's microphone button records from your browser, sends the clip to ElevenLabs speech-to-text, and submits the transcript into the meal assistant.

## API highlights

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/register`
- `GET /api/customers`, `GET /api/customers/{customer_id}`
- `GET /api/tags`, `GET/PUT /api/customers/{customer_id}/preferences`
- `GET /api/onboarding/questions`
- `GET /api/recommendations/{customer_id}`
- `GET /api/catalog/articles`, `GET /api/catalog/articles/{sku}`
- `GET /api/catalog/recipes`
- `POST /api/catalog/shopping-from-meals`
- `POST /api/catalog/match-dishes` (OpenAI)
- `GET /api/customers/{customer_id}/shopping-basket`
- `GET /api/deliveries`, `POST /api/orders`, order getters

## Frontend ↔ backend wiring

- Weekly planner loads recipes from `GET /api/catalog/recipes` and fills the grid; basket uses `POST /api/catalog/shopping-from-meals` when slots carry `recipeId`.
- **Items** loads articles from `GET /api/catalog/articles` (falls back to mock data if the API is down).
- **AI panel** calls `POST /api/catalog/match-dishes`.
