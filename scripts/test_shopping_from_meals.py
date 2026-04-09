#!/usr/bin/env python3
"""Tests for meal-plan shopping merge and checkout caps (uv run python scripts/test_shopping_from_meals.py)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from backend.config import DB_PATH
from backend.db import Db
from backend.services.shopping_from_meal_plan import build_shopping_from_meals


class TestShoppingFromMeals(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.db = Db(DB_PATH)

    def test_olive_oil_capped_when_many_recipes_use_it(self) -> None:
        rid = "02de8aa5-40b0-414f-a534-b64359fcff65"
        meals = [{"recipe_id": rid, "label": f"day{i}"} for i in range(10)]
        out = build_shopping_from_meals(self.db, meals)
        oil = next((c for c in out["checkout_lines"] if c["sku"] == "OIL-OLV-001"), None)
        self.assertIsNotNone(oil)
        self.assertEqual(oil["quantity"], 1)
        self.assertEqual(oil["line_total"], round(float(oil["unit_price"]) * oil["quantity"], 2))

    def test_vegetables_not_capped_by_default(self) -> None:
        rid = "02de8aa5-40b0-414f-a534-b64359fcff65"
        meals = [{"recipe_id": rid, "label": f"day{i}"} for i in range(3)]
        out = build_shopping_from_meals(self.db, meals)
        tomato = next((c for c in out["checkout_lines"] if c["sku"] == "VEG-TOM-001"), None)
        self.assertIsNotNone(tomato)
        self.assertEqual(tomato["quantity"], 9)


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestShoppingFromMeals)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
