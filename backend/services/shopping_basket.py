"""Shopping recommendation from a customer's orders in the previous calendar week."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.db import Db


def parse_creation_date(raw: str) -> datetime:
    s = raw.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def previous_week_bounds(today: date) -> tuple[date, date]:
    """Monday–Sunday of the calendar week before the week containing `today`."""
    monday_this = today - timedelta(days=today.weekday())
    monday_prev = monday_this - timedelta(days=7)
    sunday_prev = monday_prev + timedelta(days=6)
    return monday_prev, sunday_prev


def build_shopping_basket(
    db: Db,
    customer_id: str,
    *,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """
    Mirror ``scripts/shopping_basket.py``: recipe order counts from the prior week,
    ingredient lines per recipe, and standalone groceries (SKUs not part of that order's recipe).
    """
    today = reference_date or datetime.now(timezone.utc).date()
    week_start, week_end = previous_week_bounds(today)
    cust = customer_id.strip()

    order_rows = db.rows(
        "SELECT id, creation_date FROM orders WHERE customer_id = ?", (cust,)
    )
    order_ids: set[str] = set()
    for row in order_rows:
        try:
            created = parse_creation_date(row["creation_date"])
        except (KeyError, ValueError) as e:
            raise ValueError(f"Bad order row id={row.get('id')}: {e}") from e
        d = created.astimezone(timezone.utc).date()
        if week_start <= d <= week_end:
            order_ids.add(row["id"].strip())

    order_to_recipe: dict[str, str] = {}
    for row in db.rows("SELECT order_id, recipe_id FROM order_recipes"):
        oid = row.get("order_id", "").strip()
        rid = row.get("recipe_id", "").strip()
        if oid and rid:
            order_to_recipe[oid] = rid

    recipe_names: dict[str, str] = {}
    for row in db.rows("SELECT id, name FROM recipes"):
        rid = row.get("id", "").strip()
        if rid:
            recipe_names[rid] = (row.get("name") or rid).strip()

    ing_names: dict[str, str] = {}
    for row in db.rows("SELECT id, name FROM ingredients"):
        iid = row.get("id", "").strip()
        if iid:
            ing_names[iid] = (row.get("name") or iid).strip()

    ing_to_sku: dict[str, str] = {}
    for row in db.rows(
        "SELECT ingredient_id, article_sku FROM ingredient_articles"
    ):
        iid = row.get("ingredient_id", "").strip()
        sku = row.get("article_sku", "").strip()
        if iid and sku:
            ing_to_sku[iid] = sku

    recipe_skus: dict[str, set[str]] = defaultdict(set)
    recipe_ingredient_rows: dict[str, list[tuple[str, str, int, str]]] = defaultdict(
        list
    )
    for row in db.rows(
        """
        SELECT recipe_id, ingredient_id, quantity
        FROM recipe_ingredients
        """
    ):
        rid = row.get("recipe_id", "").strip()
        iid = row.get("ingredient_id", "").strip()
        if not rid or not iid:
            continue
        try:
            rq = int(row.get("quantity") or 0)
        except (TypeError, ValueError):
            rq = 0
        sku = ing_to_sku.get(iid, "")
        if sku:
            recipe_skus[rid].add(sku)
        label = ing_names.get(iid, iid)
        recipe_ingredient_rows[rid].append((iid, sku, rq, label))

    articles_meta: dict[str, tuple[str, str]] = {}
    for row in db.rows("SELECT sku, name, category FROM articles"):
        sku = row.get("sku", "").strip()
        if not sku:
            continue
        name = (row.get("name") or sku).strip()
        cat = (row.get("category") or "").strip()
        articles_meta[sku] = (name, cat)

    recipe_order_count: dict[str, int] = defaultdict(int)
    for oid in order_ids:
        rid = order_to_recipe.get(oid)
        if rid:
            recipe_order_count[rid] += 1

    standalone_qty: dict[str, int] = defaultdict(int)
    for row in db.rows(
        "SELECT order_id, sku, quantity FROM orderlines"
    ):
        oid = row.get("order_id", "").strip()
        if oid not in order_ids:
            continue
        sku = row.get("sku", "").strip()
        if not sku:
            continue
        try:
            q = int(row["quantity"])
        except (KeyError, ValueError):
            q = 0
        rid = order_to_recipe.get(oid)
        allowed: set[str] = recipe_skus.get(rid, set()) if rid else set()
        if rid and sku in allowed:
            continue
        standalone_qty[sku] += q

    dishes: list[dict[str, Any]] = []
    for rid in sorted(recipe_order_count.keys(), key=lambda r: recipe_names.get(r, r)):
        name = recipe_names.get(rid, rid)
        n = recipe_order_count[rid]
        ing_out: list[dict[str, Any]] = []
        for iid, sku, rq, label in recipe_ingredient_rows.get(rid, []):
            ing_out.append(
                {
                    "ingredient_id": iid,
                    "sku": sku or None,
                    "quantity": rq,
                    "label": label,
                }
            )
        dishes.append(
            {
                "recipe_id": rid,
                "name": name,
                "order_count": n,
                "ingredients": ing_out,
            }
        )

    standalone: list[dict[str, Any]] = []
    for sku in sorted(standalone_qty.keys()):
        name, cat = articles_meta.get(sku, (sku, ""))
        standalone.append(
            {
                "sku": sku,
                "quantity": standalone_qty[sku],
                "name": name,
                "category": cat or None,
            }
        )

    return {
        "customer_id": cust,
        "reference_today": today.isoformat(),
        "previous_week_start": week_start.isoformat(),
        "previous_week_end": week_end.isoformat(),
        "orders_in_window": len(order_ids),
        "dishes": dishes,
        "standalone_groceries": standalone,
    }
