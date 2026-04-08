"""Expand planned meals into per-meal detail rows and merged checkout lines."""

from __future__ import annotations

from typing import Any

from backend.db import Db


def _meal_plan_checkout_caps(db: Db) -> dict[str, int]:
    rows = db.rows(
        """
        SELECT sku, meal_plan_checkout_max_qty
        FROM articles
        WHERE meal_plan_checkout_max_qty IS NOT NULL
        """
    )
    out: dict[str, int] = {}
    for r in rows:
        sku = str(r["sku"]).strip()
        try:
            cap = int(r["meal_plan_checkout_max_qty"] or 0)
        except (TypeError, ValueError):
            continue
        if cap > 0:
            out[sku] = cap
    return out


def _slot_recipe_id(slot: Any) -> str:
    if isinstance(slot, dict):
        return str(slot["recipe_id"]).strip()
    return str(slot.recipe_id).strip()


def _slot_label(slot: Any) -> str:
    if isinstance(slot, dict):
        return str(slot.get("label", ""))
    return str(slot.label)


def build_shopping_from_meals(db: Db, meals: list[Any]) -> dict[str, Any]:
    """
    Per-meal ingredient lines in ``detail``; merged SKUs in ``checkout_lines``.
    Quantities in ``checkout_lines`` are capped by ``articles.meal_plan_checkout_max_qty``
    when set (e.g. one bottle of oil for the whole week).
    """
    detail: list[dict[str, Any]] = []
    sku_merge: dict[str, dict[str, Any]] = {}

    for slot in meals:
        recipe_id = _slot_recipe_id(slot)
        label = _slot_label(slot)
        rows = db.rows(
            """
            SELECT r.name AS recipe_name, ri.quantity AS ingredient_qty,
                   i.name AS ingredient_name, a.sku, a.name AS article_name,
                   a.price AS unit_price
            FROM recipe_ingredients ri
            JOIN recipes r ON r.id = ri.recipe_id
            JOIN ingredients i ON i.id = ri.ingredient_id
            JOIN ingredient_articles ia ON ia.ingredient_id = ri.ingredient_id
            JOIN articles a ON a.sku = ia.article_sku AND a.is_available = 1
            WHERE ri.recipe_id = ?
            ORDER BY i.name
            """,
            (recipe_id,),
        )
        for row in rows:
            qty = int(row["ingredient_qty"])
            unit = float(row["unit_price"])
            line_total = round(unit * qty, 2)
            sku = str(row["sku"]).strip()
            detail.append(
                {
                    "meal_label": label,
                    "recipe_id": recipe_id,
                    "recipe_name": row["recipe_name"],
                    "ingredient_name": row["ingredient_name"],
                    "sku": sku,
                    "article_name": row["article_name"],
                    "quantity": qty,
                    "unit_price": unit,
                    "line_total": line_total,
                }
            )
            if sku not in sku_merge:
                sku_merge[sku] = {
                    "sku": sku,
                    "article_name": row["article_name"],
                    "unit_price": unit,
                    "quantity": 0,
                }
            sku_merge[sku]["quantity"] += qty

    caps = _meal_plan_checkout_caps(db)
    checkout_lines: list[dict[str, Any]] = []
    for v in sku_merge.values():
        sku = v["sku"]
        raw_q = int(v["quantity"])
        q = raw_q
        if sku in caps:
            q = min(q, caps[sku])
        unit = float(v["unit_price"])
        checkout_lines.append(
            {
                "sku": sku,
                "quantity": q,
                "name": v["article_name"],
                "unit_price": unit,
                "line_total": round(unit * q, 2),
            }
        )

    return {"detail": detail, "checkout_lines": checkout_lines}
