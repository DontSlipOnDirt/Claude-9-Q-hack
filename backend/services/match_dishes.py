"""Match natural-language dish queries to the recipe catalog via OpenAI."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from backend.db import Db

# Prefer at least this many suggestions when the catalog has enough recipes (UI + user expectations).
_MIN_SUGGESTIONS = 6
_MAX_SUGGESTIONS = 12

_STOPWORDS = frozenset(
    """
    a an the for with and or to of in on at as by from into over under up down some any
    want like something me my i we you quick easy fast recipe dish meal food make cook
    need looking ideas idea help please can could would should
    """.split()
)


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
- Pick dishes from the catalog that plausibly match what the user wants. Be generous: include partial matches (similar protein, starch, cooking method, or cuisine style) even when wording differs.
- Prefer recipes whose description or implied ingredients align with the request; if the catalog has no exact cuisine, suggest the closest alternatives (e.g. another curry, pasta, salad, or rice dish).
- Order results from best match to weaker match.
- Return at least 3 distinct recipes from the catalog whenever the request is about food, meals, ingredients, dietary style, or cooking — unless the catalog is empty.
- Only return an empty matches list if the user message is clearly not a food/meal request (e.g. pure gibberish or unrelated topic).

Respond with a single JSON object (no markdown fences) with this exact shape:
{{"matches":[{{"id":"<uuid from catalog>","name":"<name from catalog>","reason":"<one short sentence why it fits>"}}]}}
"""


def _tokenize_query(user_query: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", user_query.lower())
    out: list[str] = []
    for t in raw:
        if len(t) < 2 or t in _STOPWORDS:
            continue
        out.append(t)
    return out


def _recipe_rows_for_lexical(db: Db) -> list[dict[str, Any]]:
    return db.rows(
        """
        SELECT r.id, r.name, r.description,
               COALESCE(GROUP_CONCAT(DISTINCT i.name), '') AS ing,
               COALESCE(GROUP_CONCAT(DISTINCT pt.name), '') AS tags
        FROM recipes r
        LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        LEFT JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
        LEFT JOIN preference_tags pt ON pt.id = rt.tag_id
        GROUP BY r.id
        """
    )


def lexical_fallback_matches(
    db: Db,
    user_query: str,
    *,
    limit: int,
    exclude: set[str],
) -> list[dict[str, Any]]:
    """
    Keyword-style matches over name, description, ingredients, and tag labels.
    Used when the model returns too few rows or hallucinated ids.
    """
    if limit <= 0:
        return []
    rows = _recipe_rows_for_lexical(db)
    tokens = _tokenize_query(user_query)
    scored: list[tuple[int, str, dict[str, Any]]] = []
    for row in rows:
        rid = str(row["id"])
        if rid in exclude:
            continue
        blob = " ".join(
            str(row.get(k) or "") for k in ("name", "description", "ing", "tags")
        ).lower()
        if tokens:
            score = sum(1 for tok in tokens if tok in blob)
        else:
            score = 0
        name = str(row.get("name") or "")
        scored.append((score, name, row))
    scored.sort(key=lambda x: (-x[0], x[1].lower()))
    out: list[dict[str, Any]] = []
    for score, _name, row in scored:
        rid = str(row["id"])
        if rid in exclude:
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if tokens and score > 0:
            reason = "Matched your search in the catalog (name, ingredients, or description)."
        else:
            reason = "From your catalog — add keywords (ingredients, cuisine) to narrow results."
        out.append({"id": rid, "name": name, "reason": reason})
        if len(out) >= limit:
            break
    return out


def _merge_llm_matches_with_fallback(
    db: Db,
    user_query: str,
    raw_matches: list[Any],
    valid_ids: set[str],
    id_to_name: dict[str, str],
) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_matches:
        if not isinstance(item, dict):
            continue
        rid = str(item.get("id", "")).strip()
        if rid not in valid_ids or rid in seen:
            continue
        seen.add(rid)
        name = str(item.get("name", "")).strip() or id_to_name.get(rid, "")
        reason = str(item.get("reason", "")).strip()
        if not name:
            name = id_to_name.get(rid, "")
        cleaned.append(
            {
                "id": rid,
                "name": name,
                **({"reason": reason} if reason else {}),
            }
        )

    if len(cleaned) >= _MIN_SUGGESTIONS:
        return cleaned[:_MAX_SUGGESTIONS]

    need = min(_MAX_SUGGESTIONS, max(0, _MIN_SUGGESTIONS - len(cleaned)))
    extra = lexical_fallback_matches(db, user_query, limit=need, exclude=seen)
    for row in extra:
        rid = str(row["id"])
        if rid in seen:
            continue
        seen.add(rid)
        cleaned.append(row)
        if len(cleaned) >= _MIN_SUGGESTIONS:
            break

    return cleaned[:_MAX_SUGGESTIONS]


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
    dietary_needs: list[str] | None = None,
) -> dict[str, Any]:
    """Return OpenAI JSON shape: ``{{"matches": [...]}}``."""
    catalog = recipes_catalog_csv(db)
    q = user_query.strip()
    # Keep API compatible with older callers that send dietary needs. We currently
    # apply diet constraints in the planner; for search we only provide them as context.
    if dietary_needs:
        q = f"{q}\n\nDietary needs (must respect): {', '.join(sorted(set(dietary_needs)))}"
    prompt = build_prompt(catalog, q)
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing OPENAI_KEY. Set it in openai.env as OPENAI_KEY=... or export it."
        )
    m = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    result = call_openai(api_key, m, prompt)
    raw = result.get("matches")
    if not isinstance(raw, list):
        raw = []
    id_rows = db.rows("SELECT id, name FROM recipes")
    valid_ids = {str(r["id"]) for r in id_rows}
    id_to_name = {str(r["id"]): str(r["name"] or "") for r in id_rows}
    merged = _merge_llm_matches_with_fallback(
        db, user_query.strip(), raw, valid_ids, id_to_name
    )
    result["matches"] = merged
    for item in merged:
        rid = str(item.get("id", "")).strip()
        if rid:
            item["estimated_price"] = estimate_recipe_meal_price(db, rid)
    return result
