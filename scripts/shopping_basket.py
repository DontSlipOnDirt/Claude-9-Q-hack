#!/usr/bin/env python3
"""Prior-week shopping-style report for a customer. CLI wrapper around backend.services."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from backend.config import DB_PATH
from backend.db import Db
from backend.services.shopping_basket import build_shopping_basket


def main() -> int:
    p = argparse.ArgumentParser(
        description=(
            "For a customer id, read orders from the previous calendar week, then "
            "show dishes (recipes) with ingredient lists, plus standalone groceries."
        )
    )
    p.add_argument("customer_id", help="Customer UUID")
    p.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Treat this as 'today' for week boundaries (default: UTC date today)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print structured JSON (same shape as GET /api/.../shopping-basket)",
    )
    args = p.parse_args()

    if args.date:
        today = date.fromisoformat(args.date)
    else:
        today = datetime.now(timezone.utc).date()

    db = Db(DB_PATH)
    try:
        data = build_shopping_basket(db, args.customer_id, reference_date=today)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0

    cust = data["customer_id"]
    week_start = data["previous_week_start"]
    week_end = data["previous_week_end"]
    ref = data["reference_today"]

    print(f"Customer: {cust}")
    print(f"Reference 'today': {ref}")
    print(
        f"Previous week (orders with creation_date in this range): "
        f"{week_start} .. {week_end}"
    )
    print(f"Orders in window: {data['orders_in_window']}")
    print()

    print("=== 1. Dishes (recipes) and ingredients ===")
    dishes = data["dishes"]
    if not dishes:
        print("(No recipe-linked orders in this week.)")
    else:
        for d in dishes:
            name = d["name"]
            n = d["order_count"]
            rid = d["recipe_id"]
            times = f"{n}×" if n != 1 else "once"
            print(f"\n• {name}  — ordered {times}")
            rows = d["ingredients"]
            if not rows:
                print("  (No recipe_ingredients rows or missing ingredient_articles mapping.)")
                continue
            for ing in rows:
                sku = ing.get("sku") or ""
                rq = ing["quantity"]
                ing_label = ing["label"]
                sku_bit = f" [{sku}]" if sku else ""
                print(f"    – {ing_label}{sku_bit}  ×{rq} (recipe units)")

    print()
    print("=== 2. Standalone groceries (not tied to a dish line item) ===")
    print(
        "Items on the receipt whose SKU is not listed as an ingredient of that "
        "order’s recipe (or the order has no recipe). Examples: extra milk, bread, "
        "household products."
    )
    standalone = data["standalone_groceries"]
    if not standalone:
        print("(None in this week.)")
    else:
        for item in standalone:
            sku = item["sku"]
            qty = item["quantity"]
            name = item["name"]
            cat = item.get("category") or ""
            extra = f"  [{cat}]" if cat else ""
            print(f"  {sku}  ×{qty}  ({name}){extra}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
