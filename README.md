# Claude-9-Q-hack

Picnic Q-Hack demo app with:
- SQLite data model populated from CSVs
- FastAPI backend (`backend/backend.py`)
- Figma-style themed frontend SPA (`frontend/`)

## Run locally

1. Build database:
   - `python data/build_sqlite_db.py`
2. Install deps:
   - `pip install fastapi uvicorn`
3. Start app:
   - `python main.py`
4. Open:
   - [http://127.0.0.1:8000](http://127.0.0.1:8000)

You land on **Log in / Register**. Log in uses **email + password** (there is no separate username field).

- **Primary demo account:** `demo@picnic.com` / `picnic123` (rebuild DB after pulling latest `customers.csv`).
- **Other seed customers:** password **`demo`** (e.g. `alex.doe@example.com`).

The main UI follows the **Picnic weekly meal planner** layout (toolbar, planner grid, footer checkout) with **Recipes**, **Basket**, and **History** in the top nav.

## API highlights

- `GET /api/health`
- `POST /api/auth/login` — `{ "email", "password" }`
- `POST /api/auth/register` — `{ "name", "email", "password", ...optional profile fields }`
- `GET /api/customers/{customer_id}` — session restore (no password in response)
- `GET /api/customers`
- `GET /api/tags`
- `GET /api/onboarding/questions`
- `GET/PUT /api/customers/{customer_id}/preferences`
- `GET /api/recommendations/{customer_id}`
- `GET /api/catalog/articles`
- `GET /api/catalog/articles/{sku}`
- `GET /api/catalog/recipes`
- `POST /api/orders`
- `GET /api/orders/{order_id}`
- `GET /api/deliveries`
- `GET /api/customers/{customer_id}/orders`
