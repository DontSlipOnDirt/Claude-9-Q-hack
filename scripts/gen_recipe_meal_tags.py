"""Meal-time tag definitions for recipe_tags.csv (UTF-8). Regenerate rows with: python scripts/gen_recipe_meal_tags.py"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPES = ROOT / "data" / "recipes.csv"

B = "90909090-aaaa-4000-8000-000000000001"
L = "90909090-aaaa-4000-8000-000000000002"
D = "90909090-aaaa-4000-8000-000000000003"

# Explicit meal slots per recipe id (breakfast / lunch / dinner)
MEAL_BY_ID: dict[str, tuple[str, ...]] = {
    "b2c3d4e5-f6a7-8901-2345-67890abcdef0": (L, D),
    "11111111-2222-4333-8444-555555555555": (L, D),
    "66666666-7777-4888-8999-000000000000": (L, D),
    "02de8aa5-40b0-414f-a534-b64359fcff65": (L, D),
    "d950422b-e56e-4683-a6c0-f9d245fd57b0": (L, D),
    "e761495c-fa4c-47f7-90ea-71cec36b9515": (L, D),
    "a9dd9670-f748-4699-91cb-61d56cdc5e42": (B,),
    "60198c36-0a2a-41ce-b599-35661d4b46ee": (B,),
    "25b3f08b-a55a-424f-b33b-2df511379fcd": (L, D),
    "baaa299d-4466-4f4d-b8e6-413335e04dfe": (L, D),
    "27d30c90-33f8-456e-ba6d-67b3a0d869e6": (B, L),
    "a285582e-3603-4b0f-bee7-460122e6a3bd": (L, D),
    "d54149a2-07de-4792-92ff-4b4f562f6dd5": (L, D),
    "d591f9a0-6ef9-47f6-8807-5eb5fe34b440": (L, D),
    "1324e7d0-3287-4bee-ae2b-5b4158f94bff": (L, D),
    "31ce49b4-69ea-46b0-9da4-ae06754abe8a": (B,),
    "5f16af40-2ae6-437e-a0c0-e4cf48bb1b66": (L, D),
    "bb222222-2222-4222-8222-222222222201": (L, D),
    "bb222222-2222-4222-8222-222222222202": (L, D),
    "bb222222-2222-4222-8222-222222222203": (L, D),
    "bb222222-2222-4222-8222-222222222204": (B, L, D),
    "bb222222-2222-4222-8222-222222222205": (B,),
    "c1000001-0000-4000-8000-000000000001": (L, D),
    "c1000002-0000-4000-8000-000000000002": (L, D),
    "c1000003-0000-4000-8000-000000000003": (L, D),
    "c1000004-0000-4000-8000-000000000004": (L, D),
    "c1000005-0000-4000-8000-000000000005": (B,),
    "c1000006-0000-4000-8000-000000000006": (L, D),
    "c1000007-0000-4000-8000-000000000007": (L, D),
    "c1000008-0000-4000-8000-000000000008": (L, D),
    "c1000009-0000-4000-8000-000000000009": (L, D),
    "c100000a-0000-4000-8000-00000000000a": (B, L),
    "c100000b-0000-4000-8000-00000000000b": (L, D),
    "c100000c-0000-4000-8000-00000000000c": (L, D),
    "c100000d-0000-4000-8000-00000000000d": (L, D),
    "c100000e-0000-4000-8000-00000000000e": (L, D),
    "c100000f-0000-4000-8000-00000000000f": (L, D),
    "c1000010-0000-4000-8000-000000000010": (L, D),
    "c1000011-0000-4000-8000-000000000011": (L, D),
    "c1000012-0000-4000-8000-000000000012": (B, L),
    "c1000013-0000-4000-8000-000000000013": (L, D),
    "c1000014-0000-4000-8000-000000000014": (L, D),
    "c1000015-0000-4000-8000-000000000015": (L, D),
    "c1000016-0000-4000-8000-000000000016": (L, D),
    "c1000017-0000-4000-8000-000000000017": (L, D),
    "c1000018-0000-4000-8000-000000000018": (L, D),
    "c1000019-0000-4000-8000-000000000019": (L, D),
    "c100001a-0000-4000-8000-00000000001a": (L, D),
    "c1000020-0000-4000-8000-000000000020": (L, D),
    "c1000021-0000-4000-8000-000000000021": (B,),
    "c1000022-0000-4000-8000-000000000022": (L, D),
    "c1000023-0000-4000-8000-000000000023": (L, D),
}


def main() -> None:
    with RECIPES.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    ids = {r["id"].strip() for r in rows}
    missing = ids - set(MEAL_BY_ID.keys())
    if missing:
        raise SystemExit(f"MEAL_BY_ID missing recipes: {sorted(missing)}")
    tag_for = {B: B, L: L, D: D}
    lines = [f"{rid},{tag_for[slot]}" for rid, slots in MEAL_BY_ID.items() for slot in slots]
    out = Path(__file__).resolve().parents[1] / "data" / "recipe_meal_tags_generated.csv"
    out.write_text("recipe_id,tag_id\n" + "\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(lines)} rows to {out} (merge into recipe_tags.csv or replace meal_time rows).")


if __name__ == "__main__":
    main()
