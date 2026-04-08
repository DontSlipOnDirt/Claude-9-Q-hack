#!/usr/bin/env python3
"""Build a shopping recommendation from a customer's orders in the previous calendar week."""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


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


def load_csv(path: Path) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_articles_meta(path: Path) -> dict[str, tuple[str, str]]:
    """sku -> (name, category)."""
    out: dict[str, tuple[str, str]] = {}
    if not path.is_file():
        return out
    for row in load_csv(path):
        sku = row.get("sku", "").strip()
        if not sku:
            continue
        name = (row.get("name") or sku).strip()
        cat = (row.get("category") or "").strip()
        out[sku] = (name, cat)
    return out


def main() -> int:
    p = argparse.ArgumentParser(
        description=(
            "For a customer id, read orders from the previous calendar week, then "
            "recommend dishes (recipes) with ingredient lists, plus standalone "
            "groceries not tied to a recipe order line."
        )
    )
    p.add_argument("customer_id", help="Customer UUID")
    p.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Treat this as 'today' for week boundaries (default: UTC date today)",
    )
    p.add_argument(
        "--data-dir",
        type=Path,
        help="Directory with CSV data (default: <repo>/data)",
    )
    args = p.parse_args()

    root = repo_root()
    data_dir = args.data_dir or (root / "data")
    orders_path = data_dir / "orders.csv"
    orderlines_path = data_dir / "orderlines.csv"
    order_recipes_path = data_dir / "order_recipes.csv"
    recipes_path = data_dir / "recipes.csv"
    recipe_ingredients_path = data_dir / "recipe_ingredients.csv"
    ingredient_articles_path = data_dir / "ingredient_articles.csv"
    ingredients_path = data_dir / "ingredients.csv"
    articles_path = data_dir / "articles.csv"

    required = (orders_path, orderlines_path)
    for path in required:
        if not path.is_file():
            print(f"Missing {path}", file=sys.stderr)
            return 2

    if args.date:
        today = date.fromisoformat(args.date)
    else:
        today = datetime.now(timezone.utc).date()

    week_start, week_end = previous_week_bounds(today)
    cust = args.customer_id.strip()

    order_rows = load_csv(orders_path)
    order_ids: set[str] = set()
    for row in order_rows:
        if row.get("customer_id", "").strip() != cust:
            continue
        try:
            created = parse_creation_date(row["creation_date"])
        except (KeyError, ValueError) as e:
            print(f"Bad order row id={row.get('id')}: {e}", file=sys.stderr)
            return 2
        d = created.astimezone(timezone.utc).date()
        if week_start <= d <= week_end:
            order_ids.add(row["id"].strip())

    order_to_recipe: dict[str, str] = {}
    if order_recipes_path.is_file():
        for row in load_csv(order_recipes_path):
            oid = row.get("order_id", "").strip()
            rid = row.get("recipe_id", "").strip()
            if oid and rid:
                order_to_recipe[oid] = rid

    recipe_names: dict[str, str] = {}
    if recipes_path.is_file():
        for row in load_csv(recipes_path):
            rid = row.get("id", "").strip()
            if rid:
                recipe_names[rid] = (row.get("name") or rid).strip()

    ing_names: dict[str, str] = {}
    if ingredients_path.is_file():
        for row in load_csv(ingredients_path):
            iid = row.get("id", "").strip()
            if iid:
                ing_names[iid] = (row.get("name") or iid).strip()

    ing_to_sku: dict[str, str] = {}
    if ingredient_articles_path.is_file():
        for row in load_csv(ingredient_articles_path):
            iid = row.get("ingredient_id", "").strip()
            sku = row.get("article_sku", "").strip()
            if iid and sku:
                ing_to_sku[iid] = sku

    # recipe_id -> set of article SKUs that belong to the dish
    recipe_skus: dict[str, set[str]] = defaultdict(set)
    # recipe_id -> rows for printing (recipe ingredient qty is in "recipe units")
    recipe_ingredient_rows: dict[str, list[tuple[str, str, int, str]]] = defaultdict(list)
    if recipe_ingredients_path.is_file():
        for row in load_csv(recipe_ingredients_path):
            rid = row.get("recipe_id", "").strip()
            iid = row.get("ingredient_id", "").strip()
            if not rid or not iid:
                continue
            try:
                rq = int(row.get("quantity") or 0)
            except ValueError:
                rq = 0
            sku = ing_to_sku.get(iid, "")
            if sku:
                recipe_skus[rid].add(sku)
            label = ing_names.get(iid, iid)
            recipe_ingredient_rows[rid].append((iid, sku, rq, label))

    articles = load_articles_meta(articles_path)

    line_rows = load_csv(orderlines_path)

    # Dishes: count how often each recipe was ordered in the window
    recipe_order_count: dict[str, int] = defaultdict(int)
    for oid in order_ids:
        rid = order_to_recipe.get(oid)
        if rid:
            recipe_order_count[rid] += 1

    # Standalone groceries: lines whose SKU is not part of that order's recipe article set
    standalone_qty: dict[str, int] = defaultdict(int)
    for row in line_rows:
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

    print(f"Customer: {cust}")
    print(f"Reference 'today': {today.isoformat()}")
    print(
        f"Previous week (orders with creation_date in this range): "
        f"{week_start.isoformat()} .. {week_end.isoformat()}"
    )
    print(f"Orders in window: {len(order_ids)}")
    print()

    print("=== 1. Dishes (recipes) and ingredients ===")
    if not recipe_order_count:
        print("(No recipe-linked orders in this week.)")
    else:
        for rid in sorted(recipe_order_count.keys(), key=lambda r: recipe_names.get(r, r)):
            name = recipe_names.get(rid, rid)
            n = recipe_order_count[rid]
            times = f"{n}×" if n != 1 else "once"
            print(f"\n• {name}  — ordered {times}")
            rows = recipe_ingredient_rows.get(rid, [])
            if not rows:
                print("  (No recipe_ingredients rows or missing ingredient_articles mapping.)")
                continue
            for _iid, sku, rq, ing_label in rows:
                sku_bit = f" [{sku}]" if sku else ""
                print(f"    – {ing_label}{sku_bit}  ×{rq} (recipe units)")

    print()
    print("=== 2. Standalone groceries (not tied to a dish line item) ===")
    print(
        "Items on the receipt whose SKU is not listed as an ingredient of that "
        "order’s recipe (or the order has no recipe). Examples: extra milk, bread, "
        "household products."
    )
    if not standalone_qty:
        print("(None in this week.)")
    else:
        for sku in sorted(standalone_qty.keys()):
            name, cat = articles.get(sku, (sku, ""))
            extra = f"  [{cat}]" if cat else ""
            print(f"  {sku}  ×{standalone_qty[sku]}  ({name}){extra}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
