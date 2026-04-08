from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import requests
from dotenv import load_dotenv

from backend.db import Db


load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = "claude-haiku-4-5"


TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_customer_context",
        "description": "Fetch customer profile, preferences, and recent order behavior.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
            },
            "required": ["customer_id"],
        },
    },
    {
        "name": "search_articles",
        "description": "Search grocery catalog articles by name/category and return price + availability.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_recipes",
        "description": "Search recipes by name or description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "required": ["query"],
        },
    },
    {
        "name": "frequent_items",
        "description": "Return the most frequently purchased SKUs for the customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["customer_id"],
        },
    },
    {
        "name": "estimate_order_total",
        "description": "Estimate total price for a draft order line list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lines": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sku": {"type": "string"},
                            "quantity": {"type": "integer", "minimum": 1},
                        },
                        "required": ["sku", "quantity"],
                    },
                }
            },
            "required": ["lines"],
        },
    },
]


SYSTEM_PROMPT = """You are a grocery order reasoning agent for a Picnic-style app.

Goals:
- Help the user create, refine, and edit a practical grocery order.
- Use tools to inspect customer history, preferences, recipes, and catalog pricing.
- Keep spoken responses very short and actionable.
- Always return JSON only with this exact shape:
  {
    "spoken_summary": "short sentence, <= 20 words",
    "order_draft": [
      {"sku": "VEG-TOM-001", "quantity": 2, "why": "brief reason"}
    ],
    "notes": "optional short note"
  }

Rules:
- If user input is unclear, ask one brief follow-up in spoken_summary.
- Prefer items seen in customer order history unless the user asks for new items.
- Avoid adding unavailable products.
- Do not include markdown, just JSON.
"""


@dataclass
class ConversationState:
    customer_id: str
    messages: list[dict[str, Any]] = field(default_factory=list)


class GroceryVoiceAgent:
    def __init__(self, db: Db) -> None:
        self.db = db
        self.sessions: dict[str, ConversationState] = {}

    def run_turn(
        self,
        *,
        customer_id: str,
        transcript: str,
        conversation_id: str | None,
    ) -> dict[str, Any]:
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is missing in .env")

        cid = conversation_id or str(uuid.uuid4())
        state = self.sessions.get(cid)
        if state is None:
            state = ConversationState(customer_id=customer_id)
            self.sessions[cid] = state

        state.customer_id = customer_id
        state.messages.append({"role": "user", "content": transcript})

        assistant_payload = self._run_with_tools(state)
        state.messages.append(
            {
                "role": "assistant",
                "content": assistant_payload.get("spoken_summary", "I can help with your basket."),
            }
        )

        return {
            "conversation_id": cid,
            "spoken_summary": assistant_payload.get("spoken_summary", "I can help with your basket."),
            "order_draft": assistant_payload.get("order_draft", []),
            "notes": assistant_payload.get("notes", ""),
            "transcript": transcript,
        }

    def _run_with_tools(self, state: ConversationState) -> dict[str, Any]:
        request_messages = [
            {
                "role": item["role"],
                "content": item["content"],
            }
            for item in state.messages[-8:]
        ]

        for _ in range(5):
            response = self._anthropic_messages(request_messages)
            content_blocks = response.get("content", [])
            tool_uses = [block for block in content_blocks if block.get("type") == "tool_use"]

            if tool_uses:
                request_messages.append({"role": "assistant", "content": content_blocks})
                tool_results: list[dict[str, Any]] = []
                for tool_call in tool_uses:
                    result = self._execute_tool(tool_call["name"], tool_call.get("input") or {}, state.customer_id)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_call["id"],
                            "content": json.dumps(result, ensure_ascii=True),
                        }
                    )
                request_messages.append({"role": "user", "content": tool_results})
                continue

            text_parts = [block.get("text", "") for block in content_blocks if block.get("type") == "text"]
            raw_text = "\n".join(part for part in text_parts if part).strip()
            parsed = self._parse_assistant_json(raw_text)
            if parsed:
                return parsed

        return {
            "spoken_summary": "I can draft a basket next. Tell me your goal.",
            "order_draft": [],
            "notes": "Model response fallback used.",
        }

    def _anthropic_messages(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        headers = {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": ANTHROPIC_MODEL,
            "max_tokens": 900,
            "temperature": 0.2,
            "system": SYSTEM_PROMPT,
            "messages": messages,
            "tools": TOOLS,
        }
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
            timeout=70,
        )
        response.raise_for_status()
        return response.json()

    def _parse_assistant_json(self, text: str) -> dict[str, Any] | None:
        if not text:
            return None
        candidate = text.strip()
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        candidate = candidate[start : end + 1]
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            return None

        spoken_summary = str(parsed.get("spoken_summary", "")).strip()
        if not spoken_summary:
            spoken_summary = "I updated your basket plan."

        order_draft = parsed.get("order_draft")
        if not isinstance(order_draft, list):
            order_draft = []

        clean_lines: list[dict[str, Any]] = []
        for line in order_draft:
            if not isinstance(line, dict):
                continue
            sku = str(line.get("sku", "")).strip()
            quantity = line.get("quantity", 1)
            why = str(line.get("why", "")).strip()
            try:
                quantity = int(quantity)
            except (TypeError, ValueError):
                continue
            if not sku or quantity < 1:
                continue
            clean_lines.append({"sku": sku, "quantity": quantity, "why": why})

        return {
            "spoken_summary": " ".join(spoken_summary.split())[:180],
            "order_draft": clean_lines,
            "notes": str(parsed.get("notes", "")).strip(),
        }

    def _execute_tool(self, name: str, tool_input: dict[str, Any], customer_id: str) -> dict[str, Any]:
        if name == "get_customer_context":
            return self._tool_customer_context(tool_input.get("customer_id") or customer_id)
        if name == "search_articles":
            return self._tool_search_articles(tool_input)
        if name == "search_recipes":
            return self._tool_search_recipes(tool_input)
        if name == "frequent_items":
            return self._tool_frequent_items(tool_input.get("customer_id") or customer_id, tool_input)
        if name == "estimate_order_total":
            return self._tool_estimate_total(tool_input)
        return {"error": f"Unknown tool: {name}"}

    def _tool_customer_context(self, customer_id: str) -> dict[str, Any]:
        customer = self.db.row("SELECT id, name, email, country, house_hold_size FROM customers WHERE id = ?", (customer_id,))
        if not customer:
            return {"error": "Customer not found"}

        prefs = self.db.rows(
            """
            SELECT pt.code, pt.name, cp.preference_level
            FROM customer_preferences cp
            JOIN preference_tags pt ON pt.id = cp.tag_id
            WHERE cp.customer_id = ?
            ORDER BY pt.name
            """,
            (customer_id,),
        )
        recent_orders = self.db.rows(
            """
            SELECT id, creation_date, total_price, status
            FROM orders
            WHERE customer_id = ?
            ORDER BY creation_date DESC
            LIMIT 12
            """,
            (customer_id,),
        )
        return {
            "customer": customer,
            "preferences": prefs,
            "recent_orders": recent_orders,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        }

    def _tool_search_articles(self, tool_input: dict[str, Any]) -> dict[str, Any]:
        query = str(tool_input.get("query", "")).strip()
        limit = int(tool_input.get("limit", 10) or 10)
        limit = max(1, min(limit, 25))
        rows = self.db.rows(
            """
            SELECT sku, name, category, price, is_available
            FROM articles
            WHERE LOWER(name) LIKE LOWER(?) OR LOWER(category) LIKE LOWER(?)
            ORDER BY is_available DESC, name ASC
            LIMIT ?
            """,
            (f"%{query}%", f"%{query}%", limit),
        )
        return {"query": query, "results": rows}

    def _tool_search_recipes(self, tool_input: dict[str, Any]) -> dict[str, Any]:
        query = str(tool_input.get("query", "")).strip()
        limit = int(tool_input.get("limit", 10) or 10)
        limit = max(1, min(limit, 25))
        rows = self.db.rows(
            """
            SELECT id, name, cook_time, description
            FROM recipes
            WHERE LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)
            ORDER BY name ASC
            LIMIT ?
            """,
            (f"%{query}%", f"%{query}%", limit),
        )
        return {"query": query, "results": rows}

    def _tool_frequent_items(self, customer_id: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        limit = int(tool_input.get("limit", 10) or 10)
        limit = max(1, min(limit, 20))
        rows = self.db.rows(
            """
            SELECT ol.sku, a.name, SUM(ol.quantity) AS total_qty, AVG(a.price) AS unit_price
            FROM orders o
            JOIN orderlines ol ON ol.order_id = o.id
            JOIN articles a ON a.sku = ol.sku
            WHERE o.customer_id = ?
            GROUP BY ol.sku, a.name
            ORDER BY total_qty DESC, a.name ASC
            LIMIT ?
            """,
            (customer_id, limit),
        )
        return {"customer_id": customer_id, "items": rows}

    def _tool_estimate_total(self, tool_input: dict[str, Any]) -> dict[str, Any]:
        raw_lines = tool_input.get("lines") or []
        if not isinstance(raw_lines, list):
            return {"error": "lines must be an array"}

        estimate_lines: list[dict[str, Any]] = []
        total = 0.0
        missing: list[str] = []

        for line in raw_lines:
            if not isinstance(line, dict):
                continue
            sku = str(line.get("sku", "")).strip()
            qty_raw = line.get("quantity", 1)
            try:
                qty = int(qty_raw)
            except (TypeError, ValueError):
                continue
            if not sku or qty < 1:
                continue

            row = self.db.row("SELECT name, price FROM articles WHERE sku = ?", (sku,))
            if not row:
                missing.append(sku)
                continue
            line_total = round(float(row["price"]) * qty, 2)
            total += line_total
            estimate_lines.append(
                {
                    "sku": sku,
                    "name": row["name"],
                    "quantity": qty,
                    "unit_price": float(row["price"]),
                    "line_total": line_total,
                }
            )

        return {
            "lines": estimate_lines,
            "estimated_total": round(total, 2),
            "missing_skus": missing,
        }
