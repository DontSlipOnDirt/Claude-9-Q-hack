from __future__ import annotations

import hashlib
import secrets
import urllib.error
import uuid
from datetime import date as date_type
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

from backend.config import DB_PATH, FRONTEND_DIR, OPENAI_ENV_PATH
from backend.db import Db
from backend.services.basket_recommender import (
    build_dish_recommendations,
    build_unified_weekly_recommendations,
    build_weekly_basket_recommendations,
)
from backend.services.match_dishes import load_env_file, match_dishes
from backend.services.shopping_from_meal_plan import build_shopping_from_meals
from backend.services.shopping_basket import build_shopping_basket


db = Db(DB_PATH)
app = FastAPI(title="Picnic Q-Hack API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CustomerPreferenceUpsert(BaseModel):
    tag_id: str
    preference_level: str = Field(pattern="^(required|avoid|prefer)$")
    source: str = "manual_update"
    created_at: str


class CreateOrderLine(BaseModel):
    sku: str
    quantity: int = Field(ge=1)


class CreateOrderPayload(BaseModel):
    customer_id: str
    delivery_id: str
    status: str = "paid"
    creation_date: str
    lines: list[CreateOrderLine]
    recipe_ids: list[str] = []


class LoginPayload(BaseModel):
    email: str
    password: str


class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    date_of_birth: str = "1990-01-01"
    phone_number: str = ""
    address: str = ""
    country: str = "Germany"
    house_hold_size: int = Field(default=1, ge=1)


class MealPlanSlot(BaseModel):
    recipe_id: str
    label: str


class ShoppingFromMealsBody(BaseModel):
    meals: list[MealPlanSlot]


class MatchDishesBody(BaseModel):
    query: str
    model: str | None = None


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return f"{salt}${dk}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    salt, sep, hashed = stored.partition("$")
    if not sep or not hashed:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return secrets.compare_digest(check, hashed)


def _customer_public(row: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in row.items() if k != "password_hash"}


ONBOARDING_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "q-allergy",
        "question": "Do you have any food intolerances or allergies?",
        "type": "multi_select",
        "tag_codes": ["lactose_intolerant", "gluten_free"],
    },
    {
        "id": "q-lifestyle",
        "question": "Do you follow any lifestyle or religious preferences?",
        "type": "multi_select",
        "tag_codes": ["halal", "vegetarian", "vegan"],
    },
]


def _ensure_db_exists() -> None:
    if not DB_PATH.exists():
        raise RuntimeError(
            f"Database not found at {DB_PATH}. Run scripts/build_sqlite_db.py first."
        )


@app.on_event("startup")
def startup_check() -> None:
    _ensure_db_exists()
    load_env_file(str(OPENAI_ENV_PATH))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/onboarding/questions")
def onboarding_questions() -> list[dict[str, Any]]:
    return ONBOARDING_QUESTIONS


@app.post("/api/auth/login")
def auth_login(payload: LoginPayload) -> dict[str, Any]:
    row = db.row(
        "SELECT * FROM customers WHERE LOWER(email) = LOWER(?)",
        (payload.email.strip(),),
    )
    if not row or not _verify_password(payload.password, row.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"customer": _customer_public(row)}


@app.post("/api/auth/register")
def auth_register(payload: RegisterPayload) -> dict[str, Any]:
    email = payload.email.strip()
    exists = db.row(
        "SELECT id FROM customers WHERE LOWER(email) = LOWER(?)", (email,)
    )
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")
    cid = str(uuid.uuid4())
    pw_hash = _hash_password(payload.password)
    db.execute(
        """
        INSERT INTO customers (
            id, name, date_of_birth, email, phone_number, address, country,
            house_hold_size, password_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            cid,
            payload.name.strip(),
            payload.date_of_birth,
            email,
            payload.phone_number.strip() or "—",
            payload.address.strip() or "—",
            payload.country.strip(),
            payload.house_hold_size,
            pw_hash,
        ),
    )
    row = db.row("SELECT * FROM customers WHERE id = ?", (cid,))
    assert row
    return {"customer": _customer_public(row)}


@app.get("/api/customers")
def list_customers() -> list[dict[str, Any]]:
    rows = db.rows("SELECT * FROM customers ORDER BY name")
    return [_customer_public(r) for r in rows]


@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str) -> dict[str, Any]:
    row = db.row("SELECT * FROM customers WHERE id = ?", (customer_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _customer_public(row)


@app.get("/api/tags")
def list_preference_tags() -> list[dict[str, Any]]:
    return db.rows("SELECT * FROM preference_tags ORDER BY tag_type, name")


@app.get("/api/customers/{customer_id}/preferences")
def get_customer_preferences(customer_id: str) -> list[dict[str, Any]]:
    return db.rows(
        """
        SELECT cp.customer_id, cp.tag_id, cp.preference_level, cp.source, cp.created_at,
               pt.code, pt.name, pt.tag_type
        FROM customer_preferences cp
        JOIN preference_tags pt ON pt.id = cp.tag_id
        WHERE cp.customer_id = ?
        ORDER BY pt.tag_type, pt.name
        """,
        (customer_id,),
    )


@app.put("/api/customers/{customer_id}/preferences")
def upsert_customer_preferences(
    customer_id: str, items: list[CustomerPreferenceUpsert]
) -> dict[str, Any]:
    # Replace semantics keep client simple.
    db.execute("DELETE FROM customer_preferences WHERE customer_id = ?", (customer_id,))
    for item in items:
        db.execute(
            """
            INSERT INTO customer_preferences (customer_id, tag_id, preference_level, source, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                customer_id,
                item.tag_id,
                item.preference_level,
                item.source,
                item.created_at,
            ),
        )
    return {"customer_id": customer_id, "saved_count": len(items)}


@app.get("/api/catalog/articles")
def list_articles() -> list[dict[str, Any]]:
    return db.rows("SELECT * FROM articles WHERE is_available = 1 ORDER BY category, name")


@app.get("/api/catalog/articles/{sku}")
def article_detail(sku: str) -> dict[str, Any]:
    article = db.row("SELECT * FROM articles WHERE sku = ?", (sku,))
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article["tags"] = db.rows(
        """
        SELECT pt.id, pt.code, pt.name, pt.tag_type
        FROM article_tags at
        JOIN preference_tags pt ON pt.id = at.tag_id
        WHERE at.article_sku = ?
        ORDER BY pt.tag_type, pt.name
        """,
        (sku,),
    )
    return article


@app.get("/api/catalog/recipes")
def list_recipes() -> list[dict[str, Any]]:
    return db.rows("SELECT * FROM recipes ORDER BY name")


@app.post("/api/catalog/match-dishes")
def post_match_dishes(body: MatchDishesBody) -> dict[str, Any]:
    """Natural-language dish search over the recipe catalog (OpenAI)."""
    q = body.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query must not be empty")
    try:
        return match_dishes(db, q, model=body.model)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail={"openai_status": e.code, "body": err_body},
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=str(e.reason)) from e


@app.post("/api/catalog/shopping-from-meals")
def shopping_from_meals(body: ShoppingFromMealsBody) -> dict[str, Any]:
    """
    Expand planned meals into shop lines: recipe -> ingredients -> default article SKUs.
    Repeating the same recipe (multiple slots) adds ingredient quantities again in ``detail``.
    ``checkout_lines`` merge by SKU; quantities may be capped per ``articles.meal_plan_checkout_max_qty``.
    """
    return build_shopping_from_meals(db, body.meals)


@app.get("/api/deliveries")
def list_deliveries() -> list[dict[str, Any]]:
    return db.rows(
        """
        SELECT d.id, d.timeslot, d.delivery_moment, d.trip_id, d.hub_id, d.fc_id,
               h.address AS hub_address, f.address AS fc_address
        FROM deliveries d
        JOIN hubs h ON h.id = d.hub_id
        JOIN fcs f ON f.id = d.fc_id
        ORDER BY d.delivery_moment
        """
    )


@app.get("/api/recommendations/{customer_id}")
def recommendations(customer_id: str) -> dict[str, Any]:
    prefs = db.rows(
        """
        SELECT cp.preference_level, pt.id AS tag_id, pt.code, pt.name
        FROM customer_preferences cp
        JOIN preference_tags pt ON pt.id = cp.tag_id
        WHERE cp.customer_id = ?
        """,
        (customer_id,),
    )
    required = {p["tag_id"] for p in prefs if p["preference_level"] == "required"}
    avoid = {p["tag_id"] for p in prefs if p["preference_level"] == "avoid"}
    prefer = {p["tag_id"] for p in prefs if p["preference_level"] == "prefer"}

    all_articles = db.rows("SELECT * FROM articles WHERE is_available = 1")
    all_recipes = db.rows("SELECT * FROM recipes")

    article_tags = db.rows("SELECT article_sku, tag_id FROM article_tags")
    recipe_tags = db.rows("SELECT recipe_id, tag_id FROM recipe_tags")

    article_tag_map: dict[str, set[str]] = {}
    for item in article_tags:
        article_tag_map.setdefault(item["article_sku"], set()).add(item["tag_id"])

    recipe_tag_map: dict[str, set[str]] = {}
    for item in recipe_tags:
        recipe_tag_map.setdefault(item["recipe_id"], set()).add(item["tag_id"])

    def score(tags: set[str]) -> int | None:
        if required and not required.issubset(tags):
            return None
        if tags.intersection(avoid):
            return None
        return len(tags.intersection(prefer))

    ranked_articles: list[dict[str, Any]] = []
    for article in all_articles:
        tags = article_tag_map.get(article["sku"], set())
        rank = score(tags)
        if rank is None:
            continue
        ranked_articles.append({**article, "match_score": rank})
    ranked_articles.sort(key=lambda x: (-x["match_score"], x["name"]))

    ranked_recipes: list[dict[str, Any]] = []
    for recipe in all_recipes:
        tags = recipe_tag_map.get(recipe["id"], set())
        rank = score(tags)
        if rank is None:
            continue
        ranked_recipes.append({**recipe, "match_score": rank})
    ranked_recipes.sort(key=lambda x: (-x["match_score"], x["name"]))

    return {
        "customer_id": customer_id,
        "preferences": prefs,
        "recommended_articles": ranked_articles[:12],
        "recommended_recipes": ranked_recipes[:12],
    }


@app.post("/api/orders")
def create_order(payload: CreateOrderPayload) -> dict[str, Any]:
    customer = db.row("SELECT id FROM customers WHERE id = ?", (payload.customer_id,))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    delivery = db.row("SELECT id FROM deliveries WHERE id = ?", (payload.delivery_id,))
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    order_id = str(uuid.uuid4())
    total = 0.0
    line_results: list[dict[str, Any]] = []
    for line in payload.lines:
        article = db.row("SELECT sku, price FROM articles WHERE sku = ?", (line.sku,))
        if not article:
            raise HTTPException(status_code=404, detail=f"Unknown sku: {line.sku}")
        subtotal = float(article["price"]) * line.quantity
        total += subtotal
        line_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO orderlines (id, order_id, sku, quantity) VALUES (?, ?, ?, ?)",
            (line_id, order_id, line.sku, line.quantity),
        )
        db.execute(
            "INSERT INTO orderline_ids (order_id, orderline_id) VALUES (?, ?)",
            (order_id, line_id),
        )
        line_results.append(
            {"id": line_id, "sku": line.sku, "quantity": line.quantity, "subtotal": subtotal}
        )

    db.execute(
        """
        INSERT INTO orders (id, customer_id, creation_date, delivery_id, status, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            order_id,
            payload.customer_id,
            payload.creation_date,
            payload.delivery_id,
            payload.status,
            total,
        ),
    )

    for recipe_id in payload.recipe_ids:
        db.execute(
            "INSERT INTO order_recipes (order_id, recipe_id) VALUES (?, ?)",
            (order_id, recipe_id),
        )

    return {"order_id": order_id, "total_price": round(total, 2), "lines": line_results}


@app.get("/api/orders/{order_id}")
def get_order(order_id: str) -> dict[str, Any]:
    order = db.row("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    lines = db.rows(
        """
        SELECT ol.id, ol.sku, ol.quantity, a.name, a.price
        FROM orderlines ol
        JOIN articles a ON a.sku = ol.sku
        WHERE ol.order_id = ?
        ORDER BY ol.id
        """,
        (order_id,),
    )
    recipes = db.rows(
        """
        SELECT r.id, r.name
        FROM order_recipes ord
        JOIN recipes r ON r.id = ord.recipe_id
        WHERE ord.order_id = ?
        ORDER BY r.name
        """,
        (order_id,),
    )
    return {**order, "lines": lines, "recipes": recipes}


@app.get("/api/customers/{customer_id}/orders")
def list_customer_orders(customer_id: str) -> list[dict[str, Any]]:
    return db.rows(
        """
        SELECT o.id, o.creation_date, o.status, o.total_price, d.timeslot
        FROM orders o
        JOIN deliveries d ON d.id = o.delivery_id
        WHERE o.customer_id = ?
        ORDER BY o.creation_date DESC
        """,
        (customer_id,),
    )


@app.get("/api/customers/{customer_id}/shopping-basket")
def get_customer_shopping_basket(
    customer_id: str,
    date: str | None = Query(
        None,
        description="Reference date for week boundaries (YYYY-MM-DD); default UTC today",
    ),
) -> dict[str, Any]:
    """
    Prior-week orders: recipe repeat counts, ingredient lines, and standalone groceries.
    Same rules as ``scripts/shopping_basket.py``.
    """
    row = db.row("SELECT id FROM customers WHERE id = ?", (customer_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    ref: date_type | None = None
    if date is not None and date.strip():
        try:
            ref = date_type.fromisoformat(date.strip())
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail="Invalid date; use YYYY-MM-DD"
            ) from e
    try:
        return build_shopping_basket(db, customer_id, reference_date=ref)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/customers/{customer_id}/weekly-recommendations")
def get_customer_weekly_recommendations(
    customer_id: str,
    mode: Literal["groceries", "dishes", "both"] = Query(
        "groceries",
        description="groceries=articles; dishes=recipes; both=combined payload",
    ),
    date: str | None = Query(
        None,
        description="Reference date for the planned week (YYYY-MM-DD); default UTC today",
    ),
    novelty_slots: int = Query(
        5,
        ge=0,
        le=50,
        description="Max discovery items with no/low purchase history",
    ),
) -> dict[str, Any]:
    """
    Weekly basket recommender: essentials, seven-day plan, and discovery items.

    Same logic as ``scripts/recommend_weekly_basket.py`` (JSON shape matches CLI
    ``--json``). For simple preference-tag ranking of catalog items, use
    ``GET /api/recommendations/{customer_id}`` instead.
    """
    row = db.row("SELECT id FROM customers WHERE id = ?", (customer_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    ref: date_type | None = None
    if date is not None and date.strip():
        try:
            ref = date_type.fromisoformat(date.strip())
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail="Invalid date; use YYYY-MM-DD"
            ) from e

    if mode == "groceries":
        return build_weekly_basket_recommendations(
            db, customer_id, reference_date=ref, novelty_slots=novelty_slots
        )
    if mode == "dishes":
        return build_dish_recommendations(
            db, customer_id, reference_date=ref, novelty_slots=novelty_slots
        )
    return build_unified_weekly_recommendations(
        db,
        customer_id,
        reference_date=ref,
        novelty_slots=novelty_slots,
        mode="both",
    )


FRONTEND_DIST = FRONTEND_DIR / "dist"


def _spa_dist_ready() -> bool:
    return FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file()


if _spa_dist_ready():
    _assets_dir = FRONTEND_DIST / "assets"
    if _assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(_assets_dir)),
            name="vite_assets",
        )

    @app.get("/")
    def serve_spa_index() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    def serve_spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (FRONTEND_DIST / full_path).resolve()
        dist_root = FRONTEND_DIST.resolve()
        try:
            candidate.relative_to(dist_root)
        except ValueError:
            return FileResponse(FRONTEND_DIST / "index.html")
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
