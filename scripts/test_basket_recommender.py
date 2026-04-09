#!/usr/bin/env python3
"""Stdlib tests for basket_recommender (run: uv run python scripts/test_basket_recommender.py)."""

from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from backend.config import DB_PATH
from backend.db import Db
from backend.services import basket_recommender as br
from backend.services.basket_recommender import (
    SkuTemporalProfile,
    build_dish_recommendations,
    build_unified_weekly_recommendations,
    build_weekly_basket_recommendations,
    compute_sku_temporal_profiles,
    temporal_bonus,
    _global_month_end_fraction,
    _is_month_end,
)


def _all_skus(payload: dict) -> set[str]:
    out: set[str] = set()
    for e in payload["basket"]["essential"]:
        out.add(e["sku"])
    for d in payload["weekly_plan"]:
        for it in d["items"]:
            out.add(it["sku"])
    for it in payload["basket"]["discovery"]:
        out.add(it["sku"])
    return out


class TestBasketRecommender(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.db = Db(DB_PATH)

    def test_lactose_and_nut_avoid_excludes_milk_and_nuts(self) -> None:
        cid = "a1b2c3d4-e5f6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(self.db, cid)
        self.assertNotIn("error", r or {})
        skus = _all_skus(r)
        self.assertNotIn("DAI-MLK-001", skus)
        self.assertNotIn("NUT-PIN-001", skus)

    def test_vegan_excludes_dairy_and_meat(self) -> None:
        cid = "c1d2e3f4-a5b6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(self.db, cid)
        self.assertNotIn("error", r or {})
        skus = _all_skus(r)
        dairy_meat = {
            "DAI-MLK-001",
            "DAI-MOZ-001",
            "DAI-YOG-001",
            "DAI-EGG-001",
            "MEA-CHI-001",
        }
        self.assertTrue(dairy_meat.isdisjoint(skus))

    def test_essential_covers_vegetables(self) -> None:
        cid = "b1c2d3e4-f5a6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(self.db, cid)
        ess = r["basket"]["essential"]
        veg_buckets = [x for x in ess if x.get("bucket") == "vegetables"]
        self.assertTrue(len(veg_buckets) >= 1)
        self.assertEqual(veg_buckets[0].get("category"), "Vegetables")

    def test_halal_required_eligible_nonempty(self) -> None:
        cid = "b1c2d3e4-f5a6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(self.db, cid)
        self.assertGreater(r["totals"]["line_count"], 0)

    def test_novelty_prefers_zero_history_when_possible(self) -> None:
        cid = "a1b2c3d4-e5f6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(self.db, cid, novelty_slots=8)
        disc = r["basket"]["discovery"]
        zeros = [d for d in disc if d.get("order_count_prior", 1) == 0]
        self.assertTrue(
            len(zeros) >= 1 or len(disc) == 0,
            "discovery should include never-bought items when catalog allows",
        )

    def test_eligible_filters_household(self) -> None:
        pref = br._load_preference_state(self.db, "a1b2c3d4-e5f6-7890-1234-567890abcdef")
        el, _ = br.eligible_articles(self.db, "a1b2c3d4-e5f6-7890-1234-567890abcdef", pref)
        cats = {str(a.get("category")) for a in el}
        self.assertNotIn("Household", cats)

    def test_weekly_plan_has_calendar_dates(self) -> None:
        cid = "a1b2c3d4-e5f6-7890-1234-567890abcdef"
        r = build_weekly_basket_recommendations(
            self.db, cid, reference_date=date(2026, 4, 8)
        )
        self.assertEqual(r["reference_date"], "2026-04-08")
        self.assertEqual(r["week_start"], "2026-04-06")
        for d in r["weekly_plan"]:
            self.assertIn("date", d)
            self.assertEqual(len(d["date"]), 10)


class TestUnifiedGroceriesAndDishes(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.db = Db(DB_PATH)

    MILK_DRESSING_ID = "66666666-7777-4888-8999-000000000000"

    def test_unified_both_has_groceries_and_dishes(self) -> None:
        cid = "a1b2c3d4-e5f6-7890-1234-567890abcdef"
        r = build_unified_weekly_recommendations(self.db, cid, mode="both")
        self.assertEqual(r["mode"], "both")
        self.assertIn("groceries", r)
        self.assertIn("dishes", r)
        self.assertIsNone(r["groceries"].get("error"))
        self.assertIsNone(r["dishes"].get("error"))

    def test_lactose_excludes_milk_dressing_recipe(self) -> None:
        cid = "a1b2c3d4-e5f6-7890-1234-567890abcdef"
        d = build_dish_recommendations(self.db, cid)
        self.assertNotIn("error", d or {})
        all_rid = {x["recipe_id"] for x in d["basket"]["essential"]}
        all_rid |= {x["recipe_id"] for x in d["basket"]["discovery"]}
        for day in d["weekly_plan"]:
            for it in day["items"]:
                all_rid.add(it["recipe_id"])
        self.assertNotIn(self.MILK_DRESSING_ID, all_rid)


class TestTemporalSignals(unittest.TestCase):
    def test_is_month_end(self) -> None:
        self.assertTrue(_is_month_end(date(2026, 4, 30), 3))
        self.assertFalse(_is_month_end(date(2026, 4, 10), 3))

    def test_temporal_bonus_dow(self) -> None:
        prof = SkuTemporalProfile(
            sku="S",
            event_weight=10.0,
            dow_mode=4,
            dow_strength=0.8,
        )
        ref = date(2026, 4, 13)
        friday = date(2026, 4, 17)
        self.assertEqual(friday.weekday(), 4)
        self.assertGreater(temporal_bonus(prof, ref, friday), 0.0)
        self.assertEqual(temporal_bonus(prof, ref, date(2026, 4, 13)), 0.0)

    def test_compute_profiles_month_end_and_biweek(self) -> None:
        # SKU1 buys mostly at month-end; SKU2 dilutes global month-end rate
        events = [
            ("SKU1", date(2026, 4, 29), 2),
            ("SKU1", date(2026, 4, 30), 2),
            ("SKU1", date(2026, 4, 10), 2),
            ("SKU2", date(2026, 4, 5), 10),
        ]
        g = _global_month_end_fraction(events)
        p = compute_sku_temporal_profiles(events, g)
        self.assertIn("SKU1", p)
        self.assertTrue(p["SKU1"].month_end_affinity)


def main() -> int:
    suite = unittest.TestSuite()
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestBasketRecommender))
    suite.addTests(
        unittest.defaultTestLoader.loadTestsFromTestCase(TestUnifiedGroceriesAndDishes)
    )
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestTemporalSignals))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
