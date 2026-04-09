#!/usr/bin/env python3
"""CLI: weekly grocery and/or dish (recipe) recommendations."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from datetime import date

from backend.config import DB_PATH
from backend.db import Db
from backend.services.basket_recommender import (
    build_dish_recommendations,
    build_unified_weekly_recommendations,
    build_weekly_basket_recommendations,
)


def _print_groceries(data: dict, *, stream) -> None:
    if data.get("error"):
        print(data["error"], file=stream)
        return
    print(f"Customer: {data['customer_id']}", file=stream)
    print(f"Reference date: {data.get('reference_date', '')}", file=stream)
    print(f"Week starts: {data.get('week_start', '')}", file=stream)
    print(f"Household size: {data.get('household_size', 1)}", file=stream)
    print(
        f"Constraints (codes): {', '.join(data['constraints'].get('codes') or [])}",
        file=stream,
    )
    ts = data.get("temporal_summary") or {}
    if ts:
        print(
            f"Temporal: events={ts.get('order_events')}, "
            f"global_month_end≈{ts.get('global_month_end_fraction')}, "
            f"household_in_catalog={ts.get('include_household')}",
            file=stream,
        )
    reg = data.get("region") or {}
    if reg.get("country"):
        print(
            f"Region (peer ranking): country={reg['country']!r}, "
            f"{reg.get('peer_signal', '')}",
            file=stream,
        )
    print(file=stream)
    print("=== Groceries — essential coverage ===", file=stream)
    for line in data["basket"]["essential"]:
        print(
            f"  [{line['bucket']}] {line['name']} ({line['sku']}) ×{line['quantity']}",
            file=stream,
        )
    print(file=stream)
    print("=== Groceries — seven-day plan ===", file=stream)
    for day in data["weekly_plan"]:
        print(f"  Day {day['day']}: {day['label']}", file=stream)
        if not day["items"]:
            print("    (no extra items)", file=stream)
        for it in day["items"]:
            print(
                f"    – {it['name']} ({it['sku']}) ×{it['quantity']}",
                file=stream,
            )
    print(file=stream)
    print("=== Groceries — discovery ===", file=stream)
    for it in data["basket"]["discovery"]:
        oc = it.get("order_count_prior", 0)
        print(
            f"  {it['name']} ({it['sku']}) — prior orders qty: {oc}",
            file=stream,
        )
    print(file=stream)
    t = data["totals"]
    print(
        f"Estimated grocery basket: €{t['estimated_price']:.2f} ({t['line_count']} lines)",
        file=stream,
    )


def _print_dishes(data: dict, *, stream) -> None:
    if data.get("error"):
        print(data["error"], file=stream)
        return
    print(f"Reference date: {data.get('reference_date', '')}", file=stream)
    print(f"Week starts: {data.get('week_start', '')}", file=stream)
    ts = data.get("temporal_summary") or {}
    if ts:
        print(
            f"Temporal (recipes): events={ts.get('recipe_order_events')}, "
            f"global_month_end≈{ts.get('global_month_end_fraction')}",
            file=stream,
        )
    reg = data.get("region") or {}
    if reg.get("country"):
        print(
            f"Region (peer ranking): country={reg['country']!r}, "
            f"{reg.get('peer_signal', '')}",
            file=stream,
        )
    print(file=stream)
    print("=== Dishes — featured ===", file=stream)
    for line in data["basket"]["essential"]:
        print(
            f"  {line['name']} ({line['recipe_id']}) ×{line['quantity']}",
            file=stream,
        )
    print(file=stream)
    print("=== Dishes — seven-day plan ===", file=stream)
    for day in data["weekly_plan"]:
        print(f"  Day {day['day']}: {day['label']}", file=stream)
        if not day["items"]:
            print("    (no extra items)", file=stream)
        for it in day["items"]:
            print(
                f"    – {it['name']} ({it['recipe_id']}) ×{it['quantity']}",
                file=stream,
            )
    print(file=stream)
    print("=== Dishes — discovery ===", file=stream)
    for it in data["basket"]["discovery"]:
        oc = it.get("order_count_prior", 0)
        print(
            f"  {it['name']} ({it['recipe_id']}) — prior recipe orders: {oc}",
            file=stream,
        )
    print(file=stream)
    t = data["totals"]
    print(
        f"Estimated dish plan (meal est.): €{t['estimated_price']:.2f} ({t['line_count']} lines)",
        file=stream,
    )


def main() -> int:
    p = argparse.ArgumentParser(
        description=(
            "Recommend groceries (articles) and/or dishes (recipes) using preferences, "
            "repeat purchase, same-country peer popularity, and temporal rules."
        )
    )
    p.add_argument("customer_id", help="Customer UUID")
    p.add_argument(
        "--mode",
        choices=("groceries", "dishes", "both"),
        default="groceries",
        help="groceries=articles only (default, same as before); dishes=recipes; both=combined payload",
    )
    p.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Reference date for the planned week and temporal signals (default: UTC today)",
    )
    p.add_argument(
        "--novelty-slots",
        type=int,
        default=5,
        metavar="K",
        help="Max discovery items with no/low history (default: 5)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print structured JSON",
    )
    args = p.parse_args()

    ref: date | None = None
    if args.date:
        ref = date.fromisoformat(args.date)

    db = Db(DB_PATH)

    if args.mode == "groceries":
        data = build_weekly_basket_recommendations(
            db,
            args.customer_id,
            reference_date=ref,
            novelty_slots=args.novelty_slots,
        )
    elif args.mode == "dishes":
        data = build_dish_recommendations(
            db,
            args.customer_id,
            reference_date=ref,
            novelty_slots=args.novelty_slots,
        )
    else:
        data = build_unified_weekly_recommendations(
            db,
            args.customer_id,
            reference_date=ref,
            novelty_slots=args.novelty_slots,
            mode="both",
        )

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0

    if args.mode == "both":
        g = data.get("groceries") or {}
        d = data.get("dishes") or {}
        print(f"Customer: {data['customer_id']}")
        print(f"Mode: both")
        print(f"Reference date: {data.get('reference_date', '')}")
        print(f"Week starts: {data.get('week_start', '')}")
        print()
        if g.get("error"):
            print("Groceries:", g["error"], file=sys.stderr)
        else:
            _print_groceries(g, stream=sys.stdout)
        print()
        if d.get("error"):
            print("Dishes:", d["error"], file=sys.stderr)
        else:
            _print_dishes(d, stream=sys.stdout)
        if g.get("error") and d.get("error"):
            return 2
        if g.get("error") or d.get("error"):
            return 1
        return 0

    if data.get("error"):
        print(data["error"], file=sys.stderr)
        return 2

    if args.mode == "groceries":
        _print_groceries(data, stream=sys.stdout)
    else:
        print(f"Customer: {data['customer_id']}")
        print(
            f"Constraints (codes): {', '.join(data['constraints'].get('codes') or [])}"
        )
        print()
        _print_dishes(data, stream=sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
