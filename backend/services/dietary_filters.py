"""Map household dietary labels to preference_tag codes and filter recipes."""

from __future__ import annotations

from backend.db import Db

# Must match data/preference_tags.csv
CODE_GLUTEN_FREE = "gluten_free"
CODE_HALAL = "halal"
CODE_VEGETARIAN = "vegetarian"
CODE_VEGAN = "vegan"
CODE_SPICY = "spicy"
CODE_NOT_SPICY = "not_spicy"


def recipe_diet_codes(db: Db, recipe_id: str) -> set[str]:
    rows = db.rows(
        """
        SELECT pt.code
        FROM recipe_tags rt
        JOIN preference_tags pt ON pt.id = rt.tag_id
        WHERE rt.recipe_id = ?
        """,
        (recipe_id.strip(),),
    )
    return {str(r["code"]).strip() for r in rows if r.get("code")}


def _normalize_diet_need(raw: str) -> str | None:
    """Map UI label or preference_tags.code to a canonical code for recipe matching, or None to skip."""
    s = str(raw).strip()
    if not s:
        return None
    key = s.lower().replace("-", "_").replace(" ", "_")
    if key == "glutenfree":
        key = "gluten_free"
    direct = {
        "vegan": CODE_VEGAN,
        "vegetarian": CODE_VEGETARIAN,
        "gluten_free": CODE_GLUTEN_FREE,
        "halal": CODE_HALAL,
        "spicy": CODE_SPICY,
        "not_spicy": CODE_NOT_SPICY,
    }
    if key in direct:
        return direct[key]
    legacy = {
        "Vegan": CODE_VEGAN,
        "Vegetarian": CODE_VEGETARIAN,
        "Gluten-free": CODE_GLUTEN_FREE,
        "Gluten free": CODE_GLUTEN_FREE,
        "Halal": CODE_HALAL,
        "Spicy": CODE_SPICY,
    }
    return legacy.get(s)


def recipe_satisfies_dietary_labels(tag_codes: set[str], dietary_labels: list[str]) -> bool:
    """
    Household needs may be preference_tags.code (e.g. gluten_free) or legacy UI labels.
    All selected constraints that map to recipe tags must be satisfied (AND).
    Needs with no recipe-level tag (e.g. nut allergy) are ignored for filtering.
    """
    for raw in dietary_labels:
        code = _normalize_diet_need(str(raw))
        if code is None:
            continue
        if code == CODE_VEGAN:
            if CODE_VEGAN not in tag_codes:
                return False
        elif code == CODE_VEGETARIAN:
            if CODE_VEGETARIAN not in tag_codes and CODE_VEGAN not in tag_codes:
                return False
        elif code == CODE_GLUTEN_FREE:
            if CODE_GLUTEN_FREE not in tag_codes:
                return False
        elif code == CODE_HALAL:
            if CODE_HALAL not in tag_codes:
                return False
        elif code == CODE_SPICY:
            if CODE_SPICY not in tag_codes:
                return False
        elif code == CODE_NOT_SPICY:
            if CODE_SPICY in tag_codes:
                return False
    return True
