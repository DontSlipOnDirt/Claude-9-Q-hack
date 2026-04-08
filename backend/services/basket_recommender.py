"""Weekly shopping-basket recommendations: essentials, diversity across days, novelty."""

from __future__ import annotations

import calendar
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.db import Db
from backend.services.shopping_basket import parse_creation_date

# Preference tag codes (must match data/preference_tags.csv)
CODE_LACTOSE = "lactose_intolerant"
CODE_GLUTEN_FREE = "gluten_free"
CODE_HALAL = "halal"
CODE_VEGETARIAN = "vegetarian"
CODE_VEGAN = "vegan"
CODE_NUT_ALLERGY = "nut_allergy"

# Tunable weights (explainable defaults)
W_REPEAT = 2.0
W_PREFER = 3.0
W_REGION = 2.0
W_NOVELTY_BONUS = 1.5

# Temporal boosts (additive, explainable)
W_DOW = 1.5
W_MONTH_END = 2.0
W_BIWEEK = 1.2

MIN_SKU_EVENTS = 3  # min weighted order events to trust per-SKU temporal stats
MONTH_END_DAYS = 3  # last K days of calendar month
MONTH_END_SHARE_MIN = 0.35
MONTH_END_RATIO_VS_GLOBAL = 1.5
BIWEEK_DOMINANCE = 0.65

# Novelty: target count of discovery SKUs (never or rarely bought)
NOVELTY_TARGET = 5
NOVELTY_MAX_HISTORY = 0  # treat as "new" if order_count <= this

# Categories excluded from a "food" weekly basket (household chemicals)
EXCLUDED_CATEGORIES = frozenset({"Household"})

@dataclass
class PreferenceState:
    required: set[str] = field(default_factory=set)
    avoid: set[str] = field(default_factory=set)
    prefer: set[str] = field(default_factory=set)
    code_by_tag_id: dict[str, str] = field(default_factory=dict)


@dataclass
class SkuTemporalProfile:
    """Per-SKU signals from dated order history (weighted by line quantity)."""

    sku: str
    event_weight: float = 0.0
    dow_mode: int | None = None  # 0=Mon … 6=Sun
    dow_strength: float = 0.0  # fraction of weight on dominant weekday
    month_end_affinity: bool = False
    iso_week_parity_preferred: int | None = None  # 0 or 1 matching iso week % 2


def _load_preference_state(db: Db, customer_id: str) -> dict[str, Any]:
    rows = db.rows(
        """
        SELECT cp.preference_level, pt.id AS tag_id, pt.code, pt.name
        FROM customer_preferences cp
        JOIN preference_tags pt ON pt.id = cp.tag_id
        WHERE cp.customer_id = ?
        """,
        (customer_id.strip(),),
    )
    state = PreferenceState()
    for r in rows:
        tid = str(r["tag_id"]).strip()
        code = str(r["code"]).strip()
        state.code_by_tag_id[tid] = code
        lvl = str(r["preference_level"]).strip()
        if lvl == "required":
            state.required.add(tid)
        elif lvl == "avoid":
            state.avoid.add(tid)
        elif lvl == "prefer":
            state.prefer.add(tid)
    return {
        "rows": rows,
        "state": state,
    }


def _article_tag_map(db: Db) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for item in db.rows("SELECT article_sku, tag_id FROM article_tags"):
        sku = str(item["article_sku"]).strip()
        tid = str(item["tag_id"]).strip()
        out.setdefault(sku, set()).add(tid)
    return out


def _sku_allergies(db: Db) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for row in db.rows("SELECT article_sku, allergy_label FROM article_allergy_labels"):
        sku = str(row["article_sku"]).strip()
        lab = str(row["allergy_label"]).strip().lower()
        out.setdefault(sku, set()).add(lab)
    return out


def _sku_order_counts(db: Db, customer_id: str) -> dict[str, int]:
    """Lifetime orderline quantities per SKU for the customer."""
    rows = db.rows(
        """
        SELECT ol.sku, SUM(ol.quantity) AS q
        FROM orderlines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE o.customer_id = ?
        GROUP BY ol.sku
        """,
        (customer_id.strip(),),
    )
    out: dict[str, int] = {}
    for r in rows:
        sku = str(r["sku"]).strip()
        try:
            q = int(r["q"] or 0)
        except (TypeError, ValueError):
            q = 0
        out[sku] = q
    return out


def _customer_country(db: Db, customer_id: str) -> str | None:
    row = db.row(
        "SELECT country FROM customers WHERE id = ?",
        (customer_id.strip(),),
    )
    if not row:
        return None
    c = str(row.get("country") or "").strip()
    return c or None


def _region_peer_sku_quantities(db: Db, customer_id: str) -> dict[str, int]:
    """
    Lifetime orderline quantities per SKU from other customers in the same country
    (region proxy). Excludes the target customer so the signal is peer-driven.
    """
    cid = customer_id.strip()
    country = _customer_country(db, cid)
    if not country:
        return {}
    rows = db.rows(
        """
        SELECT ol.sku, SUM(ol.quantity) AS q
        FROM orderlines ol
        JOIN orders o ON o.id = ol.order_id
        JOIN customers c ON c.id = o.customer_id
        WHERE c.country = ? AND o.customer_id != ?
        GROUP BY ol.sku
        """,
        (country, cid),
    )
    out: dict[str, int] = {}
    for r in rows:
        sku = str(r["sku"]).strip()
        try:
            out[sku] = int(r["q"] or 0)
        except (TypeError, ValueError):
            out[sku] = 0
    return out


def _region_peer_recipe_order_counts(db: Db, customer_id: str) -> dict[str, int]:
    """Count of recipe orders from other customers in the same country (region proxy)."""
    cid = customer_id.strip()
    country = _customer_country(db, cid)
    if not country:
        return {}
    rows = db.rows(
        """
        SELECT orr.recipe_id, COUNT(*) AS c
        FROM order_recipes orr
        JOIN orders o ON o.id = orr.order_id
        JOIN customers c ON c.id = o.customer_id
        WHERE c.country = ? AND o.customer_id != ?
        GROUP BY orr.recipe_id
        """,
        (country, cid),
    )
    out: dict[str, int] = {}
    for r in rows:
        rid = str(r["recipe_id"]).strip()
        try:
            out[rid] = int(r["c"] or 0)
        except (TypeError, ValueError):
            out[rid] = 0
    return out


def _is_month_end(order_date: date, k: int = MONTH_END_DAYS) -> bool:
    """True if order_date is in the last k calendar days of its month."""
    if k <= 0:
        return False
    _, last_day = calendar.monthrange(order_date.year, order_date.month)
    return order_date.day > last_day - k


def _load_weighted_order_events(db: Db, customer_id: str) -> list[tuple[str, date, int]]:
    """(sku, UTC date, quantity) per order line."""
    rows = db.rows(
        """
        SELECT ol.sku, ol.quantity, o.creation_date
        FROM orderlines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE o.customer_id = ?
        """,
        (customer_id.strip(),),
    )
    out: list[tuple[str, date, int]] = []
    for r in rows:
        sku = str(r["sku"]).strip()
        try:
            q = int(r["quantity"] or 0)
        except (TypeError, ValueError):
            q = 0
        if q <= 0:
            continue
        try:
            raw = str(r["creation_date"] or "")
            dt = parse_creation_date(raw).astimezone(timezone.utc)
            d = dt.date()
        except (KeyError, ValueError, TypeError):
            continue
        out.append((sku, d, q))
    return out


def _global_month_end_fraction(
    events: list[tuple[str, date, int]], k: int = MONTH_END_DAYS
) -> float:
    tw = 0.0
    me = 0.0
    for _, d, w in events:
        tw += w
        if _is_month_end(d, k):
            me += w
    return me / tw if tw > 0 else 0.0


def compute_sku_temporal_profiles(
    events: list[tuple[str, date, int]],
    global_me_share: float,
    *,
    month_end_k: int = MONTH_END_DAYS,
) -> dict[str, SkuTemporalProfile]:
    """Build per-SKU profiles from weighted events."""
    # sku -> dow weights [7], total weight, month-end weight, parity weights [2]
    dow_w: dict[str, list[float]] = defaultdict(lambda: [0.0] * 7)
    tot_w: dict[str, float] = defaultdict(float)
    me_w: dict[str, float] = defaultdict(float)
    parity_w: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])

    for sku, d, w in events:
        tot_w[sku] += w
        dow_w[sku][d.weekday()] += w
        if _is_month_end(d, month_end_k):
            me_w[sku] += w
        p = d.isocalendar()[1] % 2
        parity_w[sku][p] += w

    profiles: dict[str, SkuTemporalProfile] = {}
    for sku, tw in tot_w.items():
        prof = SkuTemporalProfile(sku=sku, event_weight=tw)
        if tw >= MIN_SKU_EVENTS:
            hist = dow_w[sku]
            mid = max(range(7), key=lambda i: hist[i])
            prof.dow_mode = mid
            prof.dow_strength = hist[mid] / tw if tw > 0 else 0.0

            end_share = me_w[sku] / tw if tw > 0 else 0.0
            baseline = global_me_share
            if end_share >= MONTH_END_SHARE_MIN and (
                baseline <= 0
                or end_share >= baseline * MONTH_END_RATIO_VS_GLOBAL
            ):
                prof.month_end_affinity = True

            pw = parity_w[sku]
            dom = max(pw[0], pw[1])
            if dom / tw >= BIWEEK_DOMINANCE:
                prof.iso_week_parity_preferred = 0 if pw[0] >= pw[1] else 1

        profiles[sku] = prof
    return profiles


def household_month_end_signal(
    events: list[tuple[str, date, int]],
    household_skus: set[str],
    global_me_share: float,
) -> bool:
    """Category-style signal: enough Household-weighted history with month-end lift."""
    tw = 0.0
    me = 0.0
    for sku, d, w in events:
        if sku not in household_skus:
            continue
        tw += w
        if _is_month_end(d, MONTH_END_DAYS):
            me += w
    if tw < 2:
        return False
    end_share = me / tw
    baseline = global_me_share
    return end_share >= MONTH_END_SHARE_MIN and (
        baseline <= 0 or end_share >= baseline * MONTH_END_RATIO_VS_GLOBAL
    )


def week_start_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def temporal_bonus(
    profile: SkuTemporalProfile | None,
    reference_date: date,
    calendar_date: date | None,
) -> float:
    """
    Extra score for scheduling. If calendar_date is set (weekly plan day), DOW applies.
    Biweek and month-end use reference_date (week being planned).
    """
    if profile is None or profile.event_weight <= 0:
        return 0.0
    b = 0.0
    if (
        calendar_date is not None
        and profile.dow_mode is not None
        and calendar_date.weekday() == profile.dow_mode
    ):
        b += W_DOW * profile.dow_strength
    if profile.iso_week_parity_preferred is not None:
        wk = reference_date.isocalendar()[1] % 2
        if wk == profile.iso_week_parity_preferred:
            b += W_BIWEEK
    if profile.month_end_affinity and _is_month_end(reference_date, MONTH_END_DAYS):
        b += W_MONTH_END
    return b


def _passes_tag_rules(
    tags: set[str],
    state: PreferenceState,
) -> bool | None:
    """Same spirit as GET /api/recommendations: None if hard reject."""
    if state.required and not state.required.issubset(tags):
        return None
    if tags.intersection(state.avoid):
        return None
    return True


def _passes_dietary_rules(
    sku: str,
    category: str,
    tags: set[str],
    state: PreferenceState,
    allergies: dict[str, set[str]],
    code_by_id: dict[str, str],
) -> bool:
    """Hard filters from preference codes + allergy labels + category heuristics."""
    required_codes = {code_by_id[t] for t in state.required if t in code_by_id}
    # "avoid" preference rows identify what the customer avoids (lactose, nuts), not article tag ids
    avoid_codes = {code_by_id[t] for t in state.avoid if t in code_by_id}

    # Lactose intolerance (avoid lactose)
    if CODE_LACTOSE in avoid_codes:
        if category == "Dairy":
            return False
        if "milk" in allergies.get(sku, ()):
            return False

    # Nut allergy
    if CODE_NUT_ALLERGY in avoid_codes:
        if "tree_nuts" in allergies.get(sku, ()) or "peanuts" in allergies.get(sku, ()):
            return False
        if category == "Nuts & Seeds":
            return False

    # Vegetarian required → no meat
    if CODE_VEGETARIAN in required_codes and category == "Meat":
        return False

    # Vegan required: article must be tagged vegan; also block animal categories
    if CODE_VEGAN in required_codes:
        vegan_tag_id = next(
            (tid for tid, c in code_by_id.items() if c == CODE_VEGAN),
            "",
        )
        if vegan_tag_id and vegan_tag_id not in tags:
            return False
        if category in ("Meat", "Dairy"):
            return False
        if sku == "PAN-HON-001":
            return False

    return True


def _article_fully_eligible(
    article: dict[str, Any],
    article_tags: dict[str, set[str]],
    allergies: dict[str, set[str]],
    state: PreferenceState,
    code_by_id: dict[str, str],
) -> bool:
    sku = str(article["sku"]).strip()
    cat = str(article.get("category") or "").strip()
    tags = article_tags.get(sku, set())
    if _passes_tag_rules(tags, state) is None:
        return False
    return _passes_dietary_rules(sku, cat, tags, state, allergies, code_by_id)


def _recipe_tag_map(db: Db) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for row in db.rows("SELECT recipe_id, tag_id FROM recipe_tags"):
        rid = str(row["recipe_id"]).strip()
        tid = str(row["tag_id"]).strip()
        out.setdefault(rid, set()).add(tid)
    return out


def _recipe_ingredient_article_groups(
    db: Db,
) -> dict[str, list[tuple[str, int, list[dict[str, Any]]]]]:
    """
    Per recipe_id: list of (ingredient_id, recipe_line_qty, [article rows sorted by price]).
    """
    rows = db.rows(
        """
        SELECT ri.recipe_id, ri.ingredient_id, ri.quantity AS recipe_line_qty,
               a.sku, a.name, a.category, a.nutriscore, a.price
        FROM recipe_ingredients ri
        JOIN ingredient_articles ia ON ia.ingredient_id = ri.ingredient_id
        JOIN articles a ON a.sku = ia.article_sku AND a.is_available = 1
        ORDER BY ri.recipe_id, ri.ingredient_id, a.price
        """
    )
    by_recipe: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(dict)
    ing_qty: dict[tuple[str, str], int] = {}
    for r in rows:
        rid = str(r["recipe_id"]).strip()
        iid = str(r["ingredient_id"]).strip()
        try:
            rq = int(r["recipe_line_qty"] or 0)
        except (TypeError, ValueError):
            rq = 0
        ing_qty[(rid, iid)] = rq
        art = {
            "sku": str(r["sku"]).strip(),
            "name": r.get("name"),
            "category": str(r.get("category") or "").strip(),
            "nutriscore": r.get("nutriscore"),
            "price": r.get("price"),
        }
        if iid not in by_recipe[rid]:
            by_recipe[rid][iid] = []
        by_recipe[rid][iid].append(art)

    out: dict[str, list[tuple[str, int, list[dict[str, Any]]]]] = {}
    for rid, ing_map in by_recipe.items():
        lst: list[tuple[str, int, list[dict[str, Any]]]] = []
        for iid, alts in ing_map.items():
            q = ing_qty.get((rid, iid), 1)
            lst.append((iid, q, alts))
        out[rid] = lst
    return out


def _recipe_meal_estimate(
    groups: list[tuple[str, int, list[dict[str, Any]]]],
    article_tags: dict[str, set[str]],
    allergies: dict[str, set[str]],
    state: PreferenceState,
    code_by_id: dict[str, str],
) -> tuple[bool, float]:
    """
    Eligible if each ingredient has at least one eligible article.
    Cost = sum(cheapest eligible price * recipe line qty) for display totals only.
    """
    if not groups:
        return False, 0.0
    total_price = 0.0
    for _iid, line_qty, alts in groups:
        ok = [
            a
            for a in alts
            if _article_fully_eligible(a, article_tags, allergies, state, code_by_id)
        ]
        if not ok:
            return False, 0.0
        best = min(ok, key=lambda x: float(x.get("price") or 0))
        try:
            pq = float(best.get("price") or 0)
        except (TypeError, ValueError):
            pq = 0.0
        total_price += pq * max(1, line_qty)
    return True, total_price


def _recipe_order_counts(db: Db, customer_id: str) -> dict[str, int]:
    rows = db.rows(
        """
        SELECT orr.recipe_id, COUNT(*) AS c
        FROM order_recipes orr
        JOIN orders o ON o.id = orr.order_id
        WHERE o.customer_id = ?
        GROUP BY orr.recipe_id
        """,
        (customer_id.strip(),),
    )
    out: dict[str, int] = {}
    for r in rows:
        rid = str(r["recipe_id"]).strip()
        try:
            out[rid] = int(r["c"] or 0)
        except (TypeError, ValueError):
            out[rid] = 0
    return out


def _load_recipe_order_events(db: Db, customer_id: str) -> list[tuple[str, date, int]]:
    """(recipe_id, date, weight=1) per order_recipes row."""
    rows = db.rows(
        """
        SELECT orr.recipe_id, o.creation_date
        FROM order_recipes orr
        JOIN orders o ON o.id = orr.order_id
        WHERE o.customer_id = ?
        """,
        (customer_id.strip(),),
    )
    out: list[tuple[str, date, int]] = []
    for r in rows:
        rid = str(r["recipe_id"]).strip()
        try:
            raw = str(r["creation_date"] or "")
            dt = parse_creation_date(raw).astimezone(timezone.utc)
            d = dt.date()
        except (KeyError, ValueError, TypeError):
            continue
        out.append((rid, d, 1))
    return out


def eligible_recipes(
    db: Db,
    pref: dict[str, Any],
    ing_groups: dict[str, list[tuple[str, int, list[dict[str, Any]]]]],
    article_tags: dict[str, set[str]],
    allergies: dict[str, set[str]],
) -> list[tuple[dict[str, Any], float, dict[str, set[str]]]]:
    """
    Returns list of (recipe_row, est_price, recipe_tags) for eligible recipes.
    """
    state: PreferenceState = pref["state"]
    code_by_id = state.code_by_tag_id
    rtags = _recipe_tag_map(db)
    recipes = db.rows("SELECT * FROM recipes ORDER BY name")
    out: list[tuple[dict[str, Any], float, dict[str, set[str]]]] = []
    for rec in recipes:
        rid = str(rec["id"]).strip()
        tags = rtags.get(rid, set())
        if _passes_tag_rules(tags, state) is None:
            continue
        groups = ing_groups.get(rid, [])
        ok, price = _recipe_meal_estimate(
            groups, article_tags, allergies, state, code_by_id
        )
        if not ok:
            continue
        out.append((dict(rec), price, tags))
    return out


def score_recipe(
    recipe: dict[str, Any],
    recipe_tags: set[str],
    state: PreferenceState,
    order_count: int,
    region_peer_recipe_orders: int,
    *,
    novelty: bool,
) -> float:
    prefer_overlap = len(recipe_tags.intersection(state.prefer))
    score = (
        W_REPEAT * math.log1p(order_count)
        + W_PREFER * prefer_overlap
        + W_REGION * math.log1p(region_peer_recipe_orders)
    )
    if novelty and order_count <= NOVELTY_MAX_HISTORY:
        score += W_NOVELTY_BONUS
    return score


def diverse_recipe_week_plan(
    eligible_base_scored: list[tuple[dict[str, Any], float]],
    profiles: dict[str, SkuTemporalProfile],
    reference_date: date,
    week_start: date,
) -> list[dict[str, Any]]:
    """Up to 2 distinct recipes per day, unique across the week."""
    used: set[str] = set()
    week: list[dict[str, Any]] = []
    for day_idx in range(7):
        day_date = week_start + timedelta(days=day_idx)
        label = DAY_FOCUS[day_idx][0]
        day_items: list[dict[str, Any]] = []
        ranked = sorted(
            eligible_base_scored,
            key=lambda rb: -(
                rb[1]
                + temporal_bonus(
                    profiles.get(str(rb[0]["id"]).strip()),
                    reference_date,
                    day_date,
                )
            ),
        )
        for row, _ in ranked:
            if len(day_items) >= 2:
                break
            rid = str(row["id"]).strip()
            if rid in used:
                continue
            used.add(rid)
            day_items.append(
                {
                    "recipe_id": rid,
                    "name": row.get("name"),
                    "quantity": 1,
                }
            )
        week.append(
            {
                "day": day_idx + 1,
                "label": label,
                "date": day_date.isoformat(),
                "items": day_items,
            }
        )
    return week


def recipe_novelty_picks(
    eligible_base_scored: list[tuple[dict[str, Any], float]],
    order_counts: dict[str, int],
    already: set[str],
    k: int = NOVELTY_TARGET,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row, _ in sorted(eligible_base_scored, key=lambda x: -x[1]):
        rid = str(row["id"]).strip()
        if rid in already:
            continue
        oc = order_counts.get(rid, 0)
        if oc > NOVELTY_MAX_HISTORY:
            continue
        out.append(
            {
                "recipe_id": rid,
                "name": row.get("name"),
                "quantity": 1,
                "reason": "Discovery (no or low recipe order history)",
                "order_count_prior": oc,
            }
        )
        if len(out) >= k:
            break
    return out


def recipe_essential_picks(
    eligible_scored: list[tuple[dict[str, Any], float]],
    max_picks: int = 6,
) -> list[dict[str, Any]]:
    """Top distinct recipes by score for 'coverage' section."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row, _ in sorted(eligible_scored, key=lambda x: -x[1]):
        rid = str(row["id"]).strip()
        if rid in seen:
            continue
        seen.add(rid)
        out.append(
            {
                "recipe_id": rid,
                "name": row.get("name"),
                "quantity": 1,
                "reason": "Featured dishes (coverage)",
            }
        )
        if len(out) >= max_picks:
            break
    return out


def build_dish_recommendations(
    db: Db,
    customer_id: str,
    *,
    reference_date: date | None = None,
    novelty_slots: int = NOVELTY_TARGET,
) -> dict[str, Any]:
    """Weekly dish (recipe) recommendations: same scoring/temporal ideas as groceries."""
    ref = reference_date or datetime.now(timezone.utc).date()
    week_start = week_start_monday(ref)

    pref = _load_preference_state(db, customer_id)
    state: PreferenceState = pref["state"]
    code_by_id = state.code_by_tag_id

    article_tags = _article_tag_map(db)
    allergies = _sku_allergies(db)
    ing_groups = _recipe_ingredient_article_groups(db)

    recipe_events = _load_recipe_order_events(db, customer_id)
    global_me_r = _global_month_end_fraction(recipe_events)
    recipe_profiles = compute_sku_temporal_profiles(recipe_events, global_me_r)

    eligible_list = eligible_recipes(
        db, pref, ing_groups, article_tags, allergies
    )
    if not eligible_list:
        constraint_info = {
            "codes": sorted({code_by_id[t] for t in state.required}
                            | {code_by_id[t] for t in state.avoid}
                            | {code_by_id[t] for t in state.prefer}),
            "required_tag_ids": sorted(state.required),
            "avoid_tag_ids": sorted(state.avoid),
            "prefer_tag_ids": sorted(state.prefer),
        }
        return {
            "customer_id": customer_id.strip(),
            "reference_date": ref.isoformat(),
            "week_start": week_start.isoformat(),
            "error": "No eligible recipes after tags and ingredient constraints.",
            "constraints": constraint_info,
            "weekly_plan": [],
            "basket": {"essential": [], "discovery": []},
            "totals": {"estimated_price": 0.0, "line_count": 0},
            "temporal_summary": {
                "global_month_end_fraction": round(global_me_r, 4),
                "recipe_order_events": len(recipe_events),
            },
        }

    order_counts = _recipe_order_counts(db, customer_id)
    region_recipe_orders = _region_peer_recipe_order_counts(db, customer_id)

    base_scored: list[tuple[dict[str, Any], float]] = []
    for rec, _est_price, rtags in eligible_list:
        rid = str(rec["id"]).strip()
        oc = order_counts.get(rid, 0)
        reg = region_recipe_orders.get(rid, 0)
        base = score_recipe(rec, rtags, state, oc, reg, novelty=False)
        base_scored.append((rec, base))

    base_scored.sort(key=lambda x: -x[1])

    ess_scored = [
        (
            art,
            b
            + temporal_bonus(
                recipe_profiles.get(str(art["id"]).strip()),
                ref,
                None,
            ),
        )
        for art, b in base_scored
    ]
    ess_scored.sort(key=lambda x: -x[1])

    essentials = recipe_essential_picks(ess_scored, max_picks=6)
    ess_ids = {e["recipe_id"] for e in essentials}

    week = diverse_recipe_week_plan(
        base_scored,
        recipe_profiles,
        ref,
        week_start,
    )
    week_ids = {i["recipe_id"] for d in week for i in d["items"]}

    already = ess_ids | week_ids
    novelty = recipe_novelty_picks(
        base_scored, order_counts, already, k=novelty_slots
    )

    # price: use est meal price per recipe line (one portion set)
    price_by_rid: dict[str, float] = {}
    for rec, est_price, _rt in eligible_list:
        price_by_rid[str(rec["id"]).strip()] = est_price

    total = 0.0
    line_count = 0

    def add_meal(q: int, rid: str) -> None:
        nonlocal total, line_count
        total += price_by_rid.get(rid, 0.0) * q
        line_count += 1

    for e in essentials:
        add_meal(int(e.get("quantity") or 1), e["recipe_id"])
    for d in week:
        for it in d["items"]:
            add_meal(int(it.get("quantity") or 1), it["recipe_id"])
    for n in novelty:
        add_meal(int(n.get("quantity") or 1), n["recipe_id"])

    constraint_info = {
        "codes": sorted({code_by_id[t] for t in state.required}
                        | {code_by_id[t] for t in state.avoid}
                        | {code_by_id[t] for t in state.prefer}),
        "required_tag_ids": sorted(state.required),
        "avoid_tag_ids": sorted(state.avoid),
        "prefer_tag_ids": sorted(state.prefer),
    }

    return {
        "customer_id": customer_id.strip(),
        "reference_date": ref.isoformat(),
        "week_start": week_start.isoformat(),
        "household_size": _household_size(db, customer_id),
        "constraints": constraint_info,
        "weights": {
            "W_REPEAT": W_REPEAT,
            "W_PREFER": W_PREFER,
            "W_REGION": W_REGION,
            "W_NOVELTY_BONUS": W_NOVELTY_BONUS,
            "W_DOW": W_DOW,
            "W_MONTH_END": W_MONTH_END,
            "W_BIWEEK": W_BIWEEK,
        },
        "region": {
            "country": _customer_country(db, customer_id),
            "peer_signal": "order_counts_from_other_customers_same_country",
        },
        "temporal_summary": {
            "global_month_end_fraction": round(global_me_r, 4),
            "recipe_order_events": len(recipe_events),
            "month_end_window_days": MONTH_END_DAYS,
        },
        "weekly_plan": week,
        "basket": {
            "essential": essentials,
            "discovery": novelty,
        },
        "totals": {
            "estimated_price": round(total, 2),
            "line_count": line_count,
        },
    }


def build_unified_weekly_recommendations(
    db: Db,
    customer_id: str,
    *,
    reference_date: date | None = None,
    novelty_slots: int = NOVELTY_TARGET,
    mode: str = "both",
) -> dict[str, Any]:
    """
    mode: 'groceries' | 'dishes' | 'both'
    """
    m = (mode or "both").strip().lower()
    if m not in ("groceries", "dishes", "both"):
        m = "both"

    ref = reference_date or datetime.now(timezone.utc).date()
    out: dict[str, Any] = {
        "customer_id": customer_id.strip(),
        "reference_date": ref.isoformat(),
        "week_start": week_start_monday(ref).isoformat(),
        "mode": m,
    }

    if m in ("groceries", "both"):
        out["groceries"] = build_weekly_basket_recommendations(
            db,
            customer_id,
            reference_date=reference_date,
            novelty_slots=novelty_slots,
        )
    if m in ("dishes", "both"):
        out["dishes"] = build_dish_recommendations(
            db,
            customer_id,
            reference_date=reference_date,
            novelty_slots=novelty_slots,
        )

    return out


def _household_skus(db: Db) -> set[str]:
    rows = db.rows(
        "SELECT sku FROM articles WHERE is_available = 1 AND category = 'Household'"
    )
    return {str(r["sku"]).strip() for r in rows}


def eligible_articles(
    db: Db,
    customer_id: str,
    pref: dict[str, Any],
    *,
    include_household: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Return available articles that pass hard constraints, plus debug constraint info.
    If include_household is True, Household category is included (e.g. month-end detergents).
    """
    state: PreferenceState = pref["state"]
    code_by_id = state.code_by_tag_id
    article_tags = _article_tag_map(db)
    allergies = _sku_allergies(db)

    all_articles = db.rows("SELECT * FROM articles WHERE is_available = 1")
    eligible: list[dict[str, Any]] = []
    for a in all_articles:
        cat = str(a.get("category") or "").strip()
        if cat in EXCLUDED_CATEGORIES and not (
            include_household and cat == "Household"
        ):
            continue
        sku = str(a["sku"]).strip()
        tags = article_tags.get(sku, set())
        rule = _passes_tag_rules(tags, state)
        if rule is None:
            continue
        if not _passes_dietary_rules(sku, cat, tags, state, allergies, code_by_id):
            continue
        eligible.append(dict(a))

    constraint_info = {
        "codes": sorted({code_by_id[t] for t in state.required}
                        | {code_by_id[t] for t in state.avoid}
                        | {code_by_id[t] for t in state.prefer}),
        "required_tag_ids": sorted(state.required),
        "avoid_tag_ids": sorted(state.avoid),
        "prefer_tag_ids": sorted(state.prefer),
    }
    return eligible, constraint_info


def score_article(
    article: dict[str, Any],
    tags: set[str],
    state: PreferenceState,
    order_count: int,
    region_peer_qty: int,
    *,
    novelty: bool,
) -> float:
    """Higher is better."""
    prefer_overlap = len(tags.intersection(state.prefer))
    score = (
        W_REPEAT * math.log1p(order_count)
        + W_PREFER * prefer_overlap
        + W_REGION * math.log1p(region_peer_qty)
    )
    if novelty and order_count <= NOVELTY_MAX_HISTORY:
        score += W_NOVELTY_BONUS
    return score


# Essential buckets: (name, category list)
ESSENTIAL_BUCKETS: list[tuple[str, list[str]]] = [
    ("bakery", ["Bakery"]),
    ("vegetables", ["Vegetables"]),
    ("fruits", ["Fruits"]),
    ("dairy_or_alternative", ["Dairy"]),
    ("protein", ["Meat", "Legumes"]),
    ("pantry_staple", ["Pantry", "Condiments"]),
]


def _pick_best_in_bucket(
    bucket_name: str,
    categories: list[str],
    articles_scored: list[tuple[dict[str, Any], float]],
    used_skus: set[str],
) -> dict[str, Any] | None:
    for row, _ in sorted(articles_scored, key=lambda x: -x[1]):
        sku = str(row["sku"]).strip()
        if sku in used_skus:
            continue
        cat = str(row.get("category") or "").strip()
        if cat in categories:
            return {
                "bucket": bucket_name,
                "sku": sku,
                "name": row.get("name"),
                "category": cat,
                "quantity": 1,
                "reason": f"Essential coverage ({bucket_name})",
            }
    return None


def _pick_alternative_dairy_bucket(
    articles_scored: list[tuple[dict[str, Any], float]],
    used_skus: set[str],
) -> dict[str, Any] | None:
    """For vegan customers: extra legumes/grains instead of dairy."""
    for row, _ in sorted(articles_scored, key=lambda x: -x[1]):
        sku = str(row["sku"]).strip()
        if sku in used_skus:
            continue
        cat = str(row.get("category") or "").strip()
        if cat in ("Legumes", "Grains"):
            return {
                "bucket": "dairy_or_alternative",
                "sku": sku,
                "name": row.get("name"),
                "category": cat,
                "quantity": 1,
                "reason": "Plant-based alternative to dairy bucket",
            }
    return None


def essential_picks(
    eligible_scored: list[tuple[dict[str, Any], float]],
    state: PreferenceState,
    code_by_id: dict[str, str],
) -> list[dict[str, Any]]:
    req_codes = {code_by_id.get(t, "") for t in state.required}
    used: set[str] = set()
    out: list[dict[str, Any]] = []

    for bucket_name, cats in ESSENTIAL_BUCKETS:
        if bucket_name == "dairy_or_alternative" and CODE_VEGAN in req_codes:
            pick = _pick_alternative_dairy_bucket(eligible_scored, used)
        else:
            pick = _pick_best_in_bucket(bucket_name, cats, eligible_scored, used)
        if pick:
            used.add(pick["sku"])
            out.append(pick)
    return out


# Seven-day rotation: theme label + preferred categories for that day
DAY_FOCUS: list[tuple[str, list[str]]] = [
    ("Monday — greens & salad", ["Vegetables", "Herbs"]),
    ("Tuesday — fruit & citrus", ["Fruits"]),
    ("Wednesday — pantry & grains", ["Pantry", "Grains"]),
    ("Thursday — protein", ["Meat", "Legumes"]),
    ("Friday — dairy & bakery", ["Dairy", "Bakery"]),
    ("Saturday — spices & condiments", ["Spices", "Condiments"]),
    ("Sunday — variety & treats", ["Sweets", "Nuts & Seeds"]),
]


def _day_focus_with_household(include_household: bool) -> list[tuple[str, list[str]]]:
    """When month-end household is active, allow Household on Wednesday (pantry) day."""
    out: list[tuple[str, list[str]]] = []
    for label, cats in DAY_FOCUS:
        c = list(cats)
        if include_household and label.startswith("Wednesday"):
            c.append("Household")
        out.append((label, c))
    return out


def diverse_week_plan(
    eligible_base_scored: list[tuple[dict[str, Any], float]],
    essential_skus: set[str],
    state: PreferenceState,
    code_by_id: dict[str, str],
    profiles: dict[str, SkuTemporalProfile],
    reference_date: date,
    week_start: date,
    *,
    include_household: bool = False,
) -> list[dict[str, Any]]:
    """One entry per calendar day with 1–2 items; scores use base + temporal (DOW for that day)."""
    req_codes = {code_by_id.get(t, "") for t in state.required}
    used: set[str] = set(essential_skus)
    per_day_category: dict[int, set[str]] = {i: set() for i in range(7)}
    week: list[dict[str, Any]] = []

    day_rows = _day_focus_with_household(include_household)
    for day_idx, (label, focus_cats) in enumerate(day_rows):
        day_date = week_start + timedelta(days=day_idx)
        day_items: list[dict[str, Any]] = []
        ranked = sorted(
            eligible_base_scored,
            key=lambda rb: -(
                rb[1]
                + temporal_bonus(
                    profiles.get(str(rb[0]["sku"]).strip()),
                    reference_date,
                    day_date,
                )
            ),
        )
        for row, _ in ranked:
            if len(day_items) >= 2:
                break
            sku = str(row["sku"]).strip()
            if sku in used:
                continue
            cat = str(row.get("category") or "").strip()
            if CODE_VEGAN in req_codes:
                if cat in ("Meat", "Dairy", "Sweets") and sku != "SWE-CHO-001":
                    if cat in ("Meat", "Dairy"):
                        continue
                if cat == "Nuts & Seeds":
                    continue  # nut-free demo path
            if cat not in focus_cats:
                continue
            if cat in per_day_category[day_idx]:
                continue
            per_day_category[day_idx].add(cat)
            used.add(sku)
            day_items.append(
                {
                    "sku": sku,
                    "name": row.get("name"),
                    "category": cat,
                    "quantity": 1,
                }
            )
        week.append(
            {
                "day": day_idx + 1,
                "label": label,
                "date": day_date.isoformat(),
                "items": day_items,
            }
        )
    return week


def novelty_picks(
    eligible_scored: list[tuple[dict[str, Any], float]],
    order_counts: dict[str, int],
    already: set[str],
    k: int = NOVELTY_TARGET,
) -> list[dict[str, Any]]:
    """Discovery SKUs with no or low history, highest score first."""
    novelty: list[dict[str, Any]] = []
    for row, _ in sorted(eligible_scored, key=lambda x: -x[1]):
        sku = str(row["sku"]).strip()
        if sku in already:
            continue
        oc = order_counts.get(sku, 0)
        if oc > NOVELTY_MAX_HISTORY:
            continue
        novelty.append(
            {
                "sku": sku,
                "name": row.get("name"),
                "category": row.get("category"),
                "quantity": 1,
                "reason": "Discovery (no or low purchase history)",
                "order_count_prior": oc,
            }
        )
        if len(novelty) >= k:
            break
    return novelty


def _household_size(db: Db, customer_id: str) -> int:
    row = db.row(
        "SELECT house_hold_size FROM customers WHERE id = ?",
        (customer_id.strip(),),
    )
    if not row:
        return 1
    try:
        n = int(row["house_hold_size"])
    except (TypeError, ValueError):
        return 1
    return max(1, min(n, 8))


def scale_quantity_for_household(q: int, household: int, category: str) -> int:
    if category in ("Vegetables", "Fruits"):
        return q + max(0, household // 2)
    return q


def build_weekly_basket_recommendations(
    db: Db,
    customer_id: str,
    *,
    reference_date: date | None = None,
    novelty_slots: int = NOVELTY_TARGET,
) -> dict[str, Any]:
    """
    Full weekly basket: essentials, 7-day plan, discovery items, totals.
    Temporal boosts use reference_date (default: UTC today) and order history.
    """
    ref = reference_date or datetime.now(timezone.utc).date()
    week_start = week_start_monday(ref)

    pref = _load_preference_state(db, customer_id)
    state: PreferenceState = pref["state"]
    code_by_id = state.code_by_tag_id

    events = _load_weighted_order_events(db, customer_id)
    global_me = _global_month_end_fraction(events)
    profiles = compute_sku_temporal_profiles(events, global_me)
    hh_skus = _household_skus(db)
    include_household = _is_month_end(ref, MONTH_END_DAYS) and (
        household_month_end_signal(events, hh_skus, global_me)
        or any(
            profiles.get(sku) is not None
            and profiles[sku].month_end_affinity
            for sku in hh_skus
        )
    )

    eligible, constraint_info = eligible_articles(
        db, customer_id, pref, include_household=include_household
    )
    if not eligible:
        return {
            "customer_id": customer_id.strip(),
            "reference_date": ref.isoformat(),
            "week_start": week_start.isoformat(),
            "error": "No eligible articles after applying preferences and constraints.",
            "constraints": constraint_info,
            "weekly_plan": [],
            "basket": {"essential": [], "discovery": []},
            "totals": {"estimated_price": 0.0, "line_count": 0},
            "temporal_summary": {
                "global_month_end_fraction": round(global_me, 4),
                "include_household": include_household,
                "order_events": len(events),
            },
        }

    order_counts = _sku_order_counts(db, customer_id)
    region_peer_qty = _region_peer_sku_quantities(db, customer_id)
    article_tags = _article_tag_map(db)
    hs = _household_size(db, customer_id)

    base_scored: list[tuple[dict[str, Any], float]] = []
    for a in eligible:
        sku = str(a["sku"]).strip()
        tags = article_tags.get(sku, set())
        oc = order_counts.get(sku, 0)
        rq = region_peer_qty.get(sku, 0)
        base = score_article(a, tags, state, oc, rq, novelty=False)
        base_scored.append((a, base))

    base_scored.sort(key=lambda x: -x[1])

    ess_scored = [
        (
            art,
            b
            + temporal_bonus(
                profiles.get(str(art["sku"]).strip()),
                ref,
                None,
            ),
        )
        for art, b in base_scored
    ]
    ess_scored.sort(key=lambda x: -x[1])

    essentials = essential_picks(ess_scored, state, code_by_id)
    ess_skus = {e["sku"] for e in essentials}

    week = diverse_week_plan(
        base_scored,
        ess_skus,
        state,
        code_by_id,
        profiles,
        ref,
        week_start,
        include_household=include_household,
    )
    week_skus = {i["sku"] for d in week for i in d["items"]}

    already = ess_skus | week_skus
    novelty = novelty_picks(base_scored, order_counts, already, k=novelty_slots)

    # Apply household scaling to essentials
    for e in essentials:
        cat = str(e.get("category") or "")
        e["quantity"] = scale_quantity_for_household(
            int(e.get("quantity") or 1), hs, cat
        )

    for d in week:
        for it in d["items"]:
            cat = str(it.get("category") or "")
            it["quantity"] = scale_quantity_for_household(
                int(it.get("quantity") or 1), hs, cat
            )

    # price total (rough)
    sku_price = {str(a["sku"]).strip(): float(a.get("price") or 0) for a in eligible}
    total = 0.0
    line_count = 0

    def add_price(q: int, sku: str) -> None:
        nonlocal total, line_count
        p = sku_price.get(sku, 0.0)
        total += p * q
        line_count += 1

    for e in essentials:
        add_price(int(e["quantity"]), e["sku"])
    for d in week:
        for it in d["items"]:
            add_price(int(it["quantity"]), it["sku"])
    for n in novelty:
        add_price(int(n.get("quantity") or 1), n["sku"])

    return {
        "customer_id": customer_id.strip(),
        "reference_date": ref.isoformat(),
        "week_start": week_start.isoformat(),
        "household_size": hs,
        "constraints": constraint_info,
        "weights": {
            "W_REPEAT": W_REPEAT,
            "W_PREFER": W_PREFER,
            "W_REGION": W_REGION,
            "W_NOVELTY_BONUS": W_NOVELTY_BONUS,
            "W_DOW": W_DOW,
            "W_MONTH_END": W_MONTH_END,
            "W_BIWEEK": W_BIWEEK,
        },
        "region": {
            "country": _customer_country(db, customer_id),
            "peer_signal": "orderline_quantities_from_other_customers_same_country",
        },
        "temporal_summary": {
            "global_month_end_fraction": round(global_me, 4),
            "include_household": include_household,
            "order_events": len(events),
            "month_end_window_days": MONTH_END_DAYS,
        },
        "weekly_plan": week,
        "basket": {
            "essential": essentials,
            "discovery": novelty,
        },
        "totals": {
            "estimated_price": round(total, 2),
            "line_count": line_count,
        },
    }
