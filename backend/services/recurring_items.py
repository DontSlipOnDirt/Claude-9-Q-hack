"""Recurring staples: manual intervals + auto-detected SKUs (≥1 order) with default cadence."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.db import Db

DEFAULT_AUTO_INTERVAL_DAYS = 14


def _parse_creation_date(value: str | None) -> date | None:
    if not value or not str(value).strip():
        return None
    s = str(value).strip()
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).date()
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _reference_date(as_of: str | None) -> date:
    if as_of and as_of.strip():
        try:
            return date.fromisoformat(as_of.strip()[:10])
        except ValueError:
            pass
    return datetime.now(timezone.utc).date()


def build_recurring_items(
    db: Db,
    customer_id: str,
    *,
    as_of: str | None = None,
    only_eligible: bool = True,
) -> dict[str, Any]:
    ref = _reference_date(as_of)

    manual_rows = db.rows(
        """
        SELECT sku, interval_days, default_quantity, source
        FROM customer_recurring_items
        WHERE customer_id = ? AND enabled = 1
        """,
        (customer_id,),
    )
    manual_by_sku = {str(r["sku"]): r for r in manual_rows}
    manual_skus = set(manual_by_sku)

    purchased = db.rows(
        """
        SELECT DISTINCT ol.sku
        FROM orderlines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE o.customer_id = ?
        """,
        (customer_id,),
    )
    purchased_skus = {str(r["sku"]) for r in purchased}

    last_dates_raw = db.rows(
        """
        SELECT ol.sku, MAX(o.creation_date) AS last_d
        FROM orderlines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE o.customer_id = ?
        GROUP BY ol.sku
        """,
        (customer_id,),
    )
    last_by_sku = {str(r["sku"]): r["last_d"] for r in last_dates_raw}

    candidate_skus = set(manual_skus) | purchased_skus
    out: list[dict[str, Any]] = []

    for sku in sorted(candidate_skus):
        article = db.row(
            "SELECT sku, name, price, image_url, category FROM articles WHERE sku = ? AND is_available = 1",
            (sku,),
        )
        if not article:
            continue

        if sku in manual_by_sku:
            row = manual_by_sku[sku]
            interval = int(row["interval_days"])
            qty = int(row["default_quantity"] or 1)
            source = str(row["source"] or "manual")
        else:
            interval = DEFAULT_AUTO_INTERVAL_DAYS
            qty = 1
            source = "auto"

        last_raw = last_by_sku.get(sku)
        last_d = _parse_creation_date(str(last_raw) if last_raw is not None else None)

        eligible = True
        next_after: date | None = None
        if last_d is not None:
            days_since = (ref - last_d).days
            if days_since < interval:
                eligible = False
                next_after = last_d + timedelta(days=interval)

        if only_eligible and not eligible:
            continue

        out.append(
            {
                "sku": sku,
                "name": article["name"],
                "price": float(article["price"]),
                "image_url": article["image_url"],
                "category": article["category"],
                "interval_days": interval,
                "source": source,
                "last_ordered_at": str(last_raw) if last_raw is not None else None,
                "suggested_quantity": max(1, qty),
                "eligible": eligible,
                "next_eligible_after": next_after.isoformat() if next_after else None,
            }
        )

    return {
        "items": out,
        "default_auto_interval_days": DEFAULT_AUTO_INTERVAL_DAYS,
        "reference_date": ref.isoformat(),
    }


def list_manual_settings(db: Db, customer_id: str) -> list[dict[str, Any]]:
    return db.rows(
        """
        SELECT c.sku, c.interval_days, c.default_quantity, c.source, c.enabled,
               a.name, a.price, a.image_url, a.category
        FROM customer_recurring_items c
        JOIN articles a ON a.sku = c.sku
        WHERE c.customer_id = ?
        ORDER BY a.name
        """,
        (customer_id,),
    )
