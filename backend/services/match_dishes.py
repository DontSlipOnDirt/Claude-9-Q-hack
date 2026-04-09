"""Match natural-language dish queries to the recipe catalog via OpenAI."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from backend.db import Db


def estimate_recipe_meal_price(db: Db, recipe_id: str) -> float:
    """
    Cheapest in-catalog article per ingredient × recipe line quantity (display estimate).
    Matches the spirit of basket_recommender meal pricing without preference filters.
    """
    rid = str(recipe_id).strip()
    if not rid:
        return 0.0
    row = db.row(
        """
        SELECT SUM(line_total) AS total
        FROM (
            SELECT CAST(ri.quantity AS INTEGER) * MIN(CAST(a.price AS REAL)) AS line_total
            FROM recipe_ingredients ri
            JOIN ingredient_articles ia ON ia.ingredient_id = ri.ingredient_id
            JOIN articles a ON a.sku = ia.article_sku AND a.is_available = 1
            WHERE ri.recipe_id = ?
            GROUP BY ri.ingredient_id
        ) t
        """,
        (rid,),
    )
    if not row or row.get("total") is None:
        return 0.0
    return round(float(row["total"]), 2)


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


def recipes_catalog_csv(db: Db) -> str:
    rows = db.rows(
        """
        SELECT id, name, portion_quantity, cook_time, description
        FROM recipes
        ORDER BY name
        """
    )
    header = "id,name,portion_quantity,cook_time,description"
    lines = [header]
    for r in rows:
        def esc(v: Any) -> str:
            s = str(v if v is not None else "")
            if "," in s or '"' in s or "\n" in s:
                return '"' + s.replace('"', '""') + '"'
            return s

        lines.append(
            ",".join(
                esc(r.get(k))
                for k in (
                    "id",
                    "name",
                    "portion_quantity",
                    "cook_time",
                    "description",
                )
            )
        )
    return "\n".join(lines)


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


def call_openai(api_key: str, model: str, user_content: str) -> dict[str, Any]:
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


def match_dishes(
    db: Db,
    user_query: str,
    *,
    model: str | None = None,
) -> dict[str, Any]:
    """Return OpenAI JSON shape: ``{{"matches": [...]}}``."""
    catalog = recipes_catalog_csv(db)
    prompt = build_prompt(catalog, user_query.strip())
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing OPENAI_KEY. Set it in openai.env as OPENAI_KEY=... or export it."
        )
    m = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    result = call_openai(api_key, m, prompt)
    matches = result.get("matches")
    if isinstance(matches, list):
        for item in matches:
            if not isinstance(item, dict):
                continue
            rid = str(item.get("id", "")).strip()
            if rid:
                item["estimated_price"] = estimate_recipe_meal_price(db, rid)
    return result
