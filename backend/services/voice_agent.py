from __future__ import annotations

import json
import re
import uuid
from datetime import date as date_type
from typing import Any

from backend.db import Db
from backend.services.basket_recommender import build_unified_weekly_recommendations
from backend.services.match_dishes import match_dishes
from backend.services.openai_client import chat_json

VALID_CATEGORIES = {"breakfast", "lunch", "dinner"}
DAY_NAMES = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}


def _customer_name(db: Db, customer_id: str) -> str:
    row = db.row("SELECT name FROM customers WHERE id = ?", (customer_id,))
    return str((row or {}).get("name") or "there")


def _customer_preferences(db: Db, customer_id: str) -> list[str]:
    rows = db.rows(
        """
        SELECT pt.name
        FROM customer_preferences cp
        JOIN preference_tags pt ON pt.id = cp.tag_id
        WHERE cp.customer_id = ?
        ORDER BY pt.name
        """,
        (customer_id,),
    )
    return [str(r["name"]) for r in rows if r.get("name")]


def _recent_recipe_names(db: Db, customer_id: str) -> list[str]:
    rows = db.rows(
        """
        SELECT r.name, COUNT(*) AS c
        FROM order_recipes orr
        JOIN orders o ON o.id = orr.order_id
        JOIN recipes r ON r.id = orr.recipe_id
        WHERE o.customer_id = ?
        GROUP BY r.name
        ORDER BY c DESC, r.name ASC
        LIMIT 5
        """,
        (customer_id,),
    )
    return [str(r["name"]) for r in rows if r.get("name")]


def _weekly_summary(db: Db, customer_id: str) -> tuple[str, dict[str, Any]]:
    recs = build_unified_weekly_recommendations(
        db,
        customer_id,
        reference_date=date_type.today(),
        novelty_slots=3,
        mode="both",
    )

    dishes = recs.get("recommended_dishes") or recs.get("recommended_recipes") or []
    groceries = recs.get("recommended_groceries") or recs.get("recommended_articles") or []

    top_dishes = [str(d.get("name", "")) for d in dishes[:3] if isinstance(d, dict)]
    top_groceries = [str(g.get("name", "")) for g in groceries[:3] if isinstance(g, dict)]

    parts = []
    if top_dishes:
        parts.append(f"Top meal ideas: {', '.join(top_dishes)}")
    if top_groceries:
        parts.append(f"Likely groceries: {', '.join(top_groceries)}")
    summary = ". ".join(parts) if parts else "I have a balanced week suggestion ready."

    return summary, {
        "weekly_recommendations": recs,
        "top_dishes": top_dishes,
        "top_groceries": top_groceries,
    }


def _plan_outline(current_plan: list[dict[str, Any]] | None) -> str:
    if not current_plan:
        return "No current session plan provided."
    compact = []
    for item in current_plan[:20]:
        day = str(item.get("day", "")).strip()
        category = str(item.get("category", "")).strip()
        meal = str(item.get("name", item.get("recipe_name", ""))).strip()
        if day and category and meal:
            compact.append(f"{day}:{category}:{meal}")
    return "; ".join(compact) if compact else "No current session plan provided."


def _find_plan_slot(
    current_plan: list[dict[str, Any]] | None,
    *,
    day: str,
    category: str,
) -> dict[str, Any] | None:
    if not current_plan:
        return None
    day_norm = day.strip().lower()
    category_norm = category.strip().lower()
    if not day_norm or category_norm not in VALID_CATEGORIES:
        return None

    for item in current_plan:
        item_day = str(item.get("day", "")).strip().lower()
        item_category = str(item.get("category", "")).strip().lower()
        if item_day == day_norm and item_category == category_norm:
            return item
    return None


def _find_slot_by_transcript(
    current_plan: list[dict[str, Any]] | None,
    transcript: str,
) -> tuple[str, str] | tuple[None, None]:
    if not current_plan:
        return None, None
    text = transcript.strip().lower()
    if not text:
        return None, None

    for item in current_plan:
        item_day = str(item.get("day", "")).strip()
        item_category = str(item.get("category", "")).strip().lower()
        if not item_day or item_category not in VALID_CATEGORIES:
            continue
        if item_day.lower() in text and item_category in text:
            return item_day, item_category
    return None, None


def _extract_move_slots(transcript: str) -> tuple[str, str, str, str] | None:
    text = transcript.strip().lower()
    if not text:
        return None
    pattern = re.compile(
        r"move\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(breakfast|lunch|dinner)\s+to\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(breakfast|lunch|dinner)"
    )
    match = pattern.search(text)
    if not match:
        return None
    return (
        match.group(1).capitalize(),
        match.group(2),
        match.group(3).capitalize(),
        match.group(4),
    )


def _reason_turn(
    *,
    transcript: str,
    customer_name: str,
    preferences: list[str],
    recent_recipes: list[str],
    plan_outline: str,
) -> dict[str, Any]:
    system_prompt = (
        "You are a concise voice meal assistant. "
        "Return JSON only with keys: intent, assistant_text, query, day, category, reason, from_day, from_category, to_day, to_category. "
        "intent must be one of: info, match_dishes, recommend_week, propose_swap, explain_plan, move_meal. "
        "Keep assistant_text under 2 short sentences. "
        "If user asks to edit/swap a meal, use propose_swap and include day/category if known. "
        "If user asks to move/reschedule meals, use move_meal and fill from_day/from_category/to_day/to_category. "
        "If user asks what is planned this week or asks for overview, use explain_plan."
    )
    user_prompt = json.dumps(
        {
            "transcript": transcript,
            "customer_name": customer_name,
            "preferences": preferences,
            "recent_recipes": recent_recipes,
            "current_plan_outline": plan_outline,
        },
        ensure_ascii=True,
    )
    return chat_json(system_content=system_prompt, user_content=user_prompt, max_tokens=500)


def run_voice_turn(
    db: Db,
    *,
    customer_id: str,
    transcript: str,
    initialize: bool,
    current_plan: list[dict[str, Any]] | None,
    pending_actions: list[dict[str, Any]] | None,
    confirmed_action_id: str | None,
) -> dict[str, Any]:
    customer_name = _customer_name(db, customer_id)
    preferences = _customer_preferences(db, customer_id)
    recent_recipes = _recent_recipe_names(db, customer_id)

    if confirmed_action_id:
        action = next(
            (a for a in (pending_actions or []) if str(a.get("id", "")).strip() == confirmed_action_id),
            None,
        )
        if not action:
            return {
                "assistant_text": "I could not find that pending action. Please ask again.",
                "tools_used": ["confirm_action"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }
        return {
            "assistant_text": "Done. I prepared the meal change and applied it to this session plan.",
            "tools_used": ["confirm_action"],
            "requires_confirmation": False,
            "proposed_actions": [],
            "applied_action": action,
            "data": {},
        }

    if initialize:
        summary, data = _weekly_summary(db, customer_id)
        pref_txt = f" Preferences: {', '.join(preferences)}." if preferences else ""
        text = f"Hi {customer_name}. {summary}.{pref_txt}".strip()
        return {
            "assistant_text": text,
            "tools_used": ["recommend_week"],
            "requires_confirmation": False,
            "proposed_actions": [],
            "data": data,
        }

    intent_obj = _reason_turn(
        transcript=transcript,
        customer_name=customer_name,
        preferences=preferences,
        recent_recipes=recent_recipes,
        plan_outline=_plan_outline(current_plan),
    )

    intent = str(intent_obj.get("intent", "info")).strip().lower()
    assistant_text = str(intent_obj.get("assistant_text", "")).strip() or "Sure."
    query = str(intent_obj.get("query", "")).strip() or transcript.strip()
    day = str(intent_obj.get("day", "")).strip()
    category = str(intent_obj.get("category", "")).strip().lower()
    reason = str(intent_obj.get("reason", "")).strip()
    from_day = str(intent_obj.get("from_day", "")).strip()
    from_category = str(intent_obj.get("from_category", "")).strip().lower()
    to_day = str(intent_obj.get("to_day", "")).strip()
    to_category = str(intent_obj.get("to_category", "")).strip().lower()
    transcript_lower = transcript.strip().lower()

    # Deterministic fallbacks reduce dependence on perfect intent classification.
    if intent == "info":
        if (
            "plan" in transcript_lower
            and any(token in transcript_lower for token in ["week", "overview", "summar", "what is", "what's"])
        ):
            intent = "explain_plan"
        elif "swap" in transcript_lower:
            intent = "propose_swap"
        elif "move" in transcript_lower and " to " in transcript_lower:
            intent = "move_meal"

    if intent == "explain_plan":
        if not current_plan:
            return {
                "assistant_text": "I can explain your plan once your current session plan is loaded.",
                "tools_used": ["explain_plan"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        previews = []
        for item in current_plan[:7]:
            d = str(item.get("day", "")).strip()
            c = str(item.get("category", "")).strip().lower()
            n = str(item.get("name", item.get("recipe_name", ""))).strip()
            if d and c and n:
                previews.append(f"{d} {c}: {n}")
        if previews:
            summary_text = "Here is your current plan: " + "; ".join(previews[:4]) + "."
        else:
            summary_text = "I have your current plan loaded, but I need complete day and meal slots to explain it."
        return {
            "assistant_text": assistant_text or summary_text,
            "tools_used": ["explain_plan"],
            "requires_confirmation": False,
            "proposed_actions": [],
            "data": {"plan_preview": previews},
        }

    if intent == "match_dishes":
        matches = match_dishes(db, query).get("matches", [])
        top = matches[:5] if isinstance(matches, list) else []
        if top:
            assistant_text = (
                assistant_text
                or f"I found {len(top)} options. Top choice is {top[0].get('name', 'a matching dish')}."
            )
        else:
            assistant_text = "I did not find strong matches. Want me to broaden the search?"
        return {
            "assistant_text": assistant_text,
            "tools_used": ["match_dishes"],
            "requires_confirmation": False,
            "proposed_actions": [],
            "data": {"matches": top},
        }

    if intent == "recommend_week":
        summary, data = _weekly_summary(db, customer_id)
        return {
            "assistant_text": assistant_text or summary,
            "tools_used": ["recommend_week"],
            "requires_confirmation": False,
            "proposed_actions": [],
            "data": data,
        }

    if intent == "propose_swap":
        if not current_plan:
            return {
                "assistant_text": "I can propose a swap, but I need the current session plan context.",
                "tools_used": ["propose_swap"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        matches = match_dishes(db, query).get("matches", [])
        first_match = matches[0] if isinstance(matches, list) and matches else None
        if not isinstance(first_match, dict):
            return {
                "assistant_text": "I could not find a suitable swap yet. Want me to try a broader query?",
                "tools_used": ["propose_swap"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        target_day = day
        target_category = category
        if not target_day or target_category not in VALID_CATEGORIES:
            inferred_day, inferred_category = _find_slot_by_transcript(current_plan, transcript)
            if inferred_day and inferred_category:
                target_day = inferred_day
                target_category = inferred_category

        if not _find_plan_slot(current_plan, day=target_day, category=target_category):
            return {
                "assistant_text": "I can swap that meal once you tell me the exact day and slot, like Tuesday dinner.",
                "tools_used": ["propose_swap"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        action = {
            "id": str(uuid.uuid4()),
            "type": "swap_meal",
            "target": {"day": target_day, "category": target_category},
            "recipe": {
                "id": str(first_match.get("id", "")),
                "name": str(first_match.get("name", "")),
                "estimated_price": first_match.get("estimated_price"),
            },
            "reason": reason or first_match.get("reason") or "Better matches your request.",
        }
        short_text = assistant_text or f"I can swap in {action['recipe']['name']}. Should I apply it?"
        return {
            "assistant_text": short_text,
            "tools_used": ["propose_swap", "match_dishes"],
            "requires_confirmation": True,
            "proposed_actions": [action],
            "data": {"candidate_matches": matches[:3] if isinstance(matches, list) else []},
        }

    if intent == "move_meal":
        if not current_plan:
            return {
                "assistant_text": "I can move meals once your current session plan is available.",
                "tools_used": ["move_meal"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        resolved_from_day = from_day or day
        resolved_from_category = from_category or category
        extracted = _extract_move_slots(transcript)
        if extracted:
            extracted_from_day, extracted_from_category, extracted_to_day, extracted_to_category = extracted
            resolved_from_day = resolved_from_day or extracted_from_day
            resolved_from_category = resolved_from_category or extracted_from_category
            to_day = to_day or extracted_to_day
            to_category = to_category or extracted_to_category

        if to_day and to_day.strip().lower() in DAY_NAMES:
            to_day = to_day.strip().capitalize()
        if not resolved_from_day or resolved_from_category not in VALID_CATEGORIES:
            inferred_day, inferred_category = _find_slot_by_transcript(current_plan, transcript)
            if inferred_day and inferred_category:
                resolved_from_day = resolved_from_day or inferred_day
                resolved_from_category = resolved_from_category or inferred_category

        if (
            not resolved_from_day
            or resolved_from_category not in VALID_CATEGORIES
            or not to_day
            or to_category not in VALID_CATEGORIES
        ):
            return {
                "assistant_text": "Please tell me both source and target, for example: move Tuesday dinner to Friday lunch.",
                "tools_used": ["move_meal"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        source_slot = _find_plan_slot(
            current_plan,
            day=resolved_from_day,
            category=resolved_from_category,
        )
        target_slot = _find_plan_slot(current_plan, day=to_day, category=to_category)
        if not source_slot or not target_slot:
            return {
                "assistant_text": "I could not find one of those slots in the current plan.",
                "tools_used": ["move_meal"],
                "requires_confirmation": False,
                "proposed_actions": [],
                "data": {},
            }

        action = {
            "id": str(uuid.uuid4()),
            "type": "move_meal",
            "from": {"day": resolved_from_day, "category": resolved_from_category},
            "to": {"day": to_day, "category": to_category},
            "reason": reason or "Rescheduled based on your request.",
        }
        return {
            "assistant_text": assistant_text
            or f"I can move {resolved_from_day} {resolved_from_category} to {to_day} {to_category}. Apply this change?",
            "tools_used": ["move_meal"],
            "requires_confirmation": True,
            "proposed_actions": [action],
            "data": {
                "plan_diff": [
                    {
                        "op": "swap_slots",
                        "from": {"day": resolved_from_day, "category": resolved_from_category},
                        "to": {"day": to_day, "category": to_category},
                    }
                ]
            },
        }

    return {
        "assistant_text": assistant_text,
        "tools_used": ["info"],
        "requires_confirmation": False,
        "proposed_actions": [],
        "data": {
            "preferences": preferences,
            "recent_recipes": recent_recipes,
        },
    }
