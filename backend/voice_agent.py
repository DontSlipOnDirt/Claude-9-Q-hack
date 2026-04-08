import csv
import json
import os
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

# ---------- Agent Config ----------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = "claude-haiku-4-5"
ANTHROPIC_MAX_TOKENS = 700
ANTHROPIC_TEMPERATURE = 0.4

DEFAULT_MAX_RECIPES = 20
MAX_STEPS_PER_RECIPE = 6

SERVER_HOST = "0.0.0.0"
SERVER_PORT = 5001
SERVER_DEBUG = True

SYSTEM_INSTRUCTIONS = (
    "You are a meal recommendation assistant. "
    "Use ONLY the recipes and ingredients provided in the JSON catalog. "
    "Recommend 2-3 meals that best match the user request. "
    "For each meal include: name, why it matches, ingredients list with quantities, "
    "and concise steps. If no strong match exists, suggest closest options and explain tradeoffs."
)


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

RECIPES_CSV = DATA_DIR / "recipes.csv"
INGREDIENTS_CSV = DATA_DIR / "ingredients.csv"
RECIPE_INGREDIENTS_CSV = DATA_DIR / "recipe_ingredients.csv"
RECIPE_INSTRUCTIONS_CSV = DATA_DIR / "recipe_instructions.csv"


def _read_csv(path: Path):
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_meal_catalog(max_steps_per_recipe: int = MAX_STEPS_PER_RECIPE):
    """Build recipe objects by joining recipes, ingredients, and instructions."""
    recipes = _read_csv(RECIPES_CSV)
    ingredients = _read_csv(INGREDIENTS_CSV)
    recipe_ingredients = _read_csv(RECIPE_INGREDIENTS_CSV)
    instructions = _read_csv(RECIPE_INSTRUCTIONS_CSV)

    ingredient_by_id = {item["id"]: item for item in ingredients}

    ingredients_by_recipe = {}
    for row in recipe_ingredients:
        recipe_id = row["recipe_id"]
        ingredient = ingredient_by_id.get(row["ingredient_id"])
        if ingredient is None:
            continue
        ingredients_by_recipe.setdefault(recipe_id, []).append(
            {
                "id": ingredient["id"],
                "name": ingredient["name"],
                "description": ingredient.get("description", ""),
                "quantity": row.get("quantity", ""),
            }
        )

    instructions_by_recipe = {}
    for row in instructions:
        recipe_id = row["recipe_id"]
        instructions_by_recipe.setdefault(recipe_id, []).append(row)

    for recipe_id, step_rows in instructions_by_recipe.items():
        step_rows.sort(key=lambda item: int(item.get("step_number", "0") or "0"))
        instructions_by_recipe[recipe_id] = [
            item.get("instruction", "") for item in step_rows[:max_steps_per_recipe]
        ]

    catalog = []
    for recipe in recipes:
        recipe_id = recipe["id"]
        catalog.append(
            {
                "id": recipe_id,
                "name": recipe.get("name", ""),
                "description": recipe.get("description", ""),
                "portion_quantity": recipe.get("portion_quantity", ""),
                "cook_time": recipe.get("cook_time", ""),
                "ingredients": ingredients_by_recipe.get(recipe_id, []),
                "instructions": instructions_by_recipe.get(recipe_id, []),
            }
        )
    return catalog


def build_anthropic_prompt(user_query: str, catalog):
    return (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"User request:\n{user_query}\n\n"
        f"Recipe catalog JSON:\n{json.dumps(catalog, ensure_ascii=True)}"
    )


def suggest_meals_with_anthropic(user_query: str, max_recipes: int = DEFAULT_MAX_RECIPES):
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is missing from environment")

    catalog = load_meal_catalog()
    prompt = build_anthropic_prompt(user_query=user_query, catalog=catalog[:max_recipes])

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=ANTHROPIC_MAX_TOKENS,
        temperature=ANTHROPIC_TEMPERATURE,
        messages=[{"role": "user", "content": prompt}],
    )

    text_chunks = []
    for block in response.content:
        value = getattr(block, "text", None)
        if value:
            text_chunks.append(value)
    return "\n".join(text_chunks).strip()


app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/meal-suggestions")
def meal_suggestions():
    payload = request.get_json(silent=True) or {}
    user_query = (payload.get("query") or "").strip()
    max_recipes = int(payload.get("max_recipes") or DEFAULT_MAX_RECIPES)

    if not user_query:
        return jsonify({"error": "Missing required field: query"}), 400

    try:
        result = suggest_meals_with_anthropic(user_query=user_query, max_recipes=max_recipes)
        return jsonify({"query": user_query, "suggestions": result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=SERVER_DEBUG)
