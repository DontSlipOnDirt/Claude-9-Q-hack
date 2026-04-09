import type { ApiRecipe } from "@/lib/api";

/** preference_tags.code values that map to positive recipe `diet_tags` requirements. */
const POSITIVE_TAG_CODES = new Set(["vegan", "vegetarian", "gluten_free", "halal"]);

/**
 * Household profile stores `preference_tags.code` values.
 * `spicy` requires the spicy tag; `not_spicy` excludes recipes tagged spicy.
 */
export function recipeMatchesHouseholdDiet(recipe: ApiRecipe, selectedCodes: string[]): boolean {
  const tags = new Set(recipe.diet_tags ?? []);
  const hasSpicy = tags.has("spicy");

  for (const raw of selectedCodes) {
    const code = raw.trim();
    if (!code) continue;
    if (code === "spicy") {
      if (!hasSpicy) return false;
      continue;
    }
    if (code === "not_spicy") {
      if (hasSpicy) return false;
      continue;
    }
    if (!POSITIVE_TAG_CODES.has(code)) continue;
    if (code === "vegan") {
      if (!tags.has("vegan")) return false;
    } else if (code === "vegetarian") {
      if (!tags.has("vegetarian") && !tags.has("vegan")) return false;
    } else if (code === "gluten_free") {
      if (!tags.has("gluten_free")) return false;
    } else if (code === "halal") {
      if (!tags.has("halal")) return false;
    }
  }
  return true;
}

export function filterRecipesForPlanner(recipes: ApiRecipe[], selectedCodes: string[]): ApiRecipe[] {
  const affectsRecipes = selectedCodes.some((c) => {
    const x = c.trim();
    return POSITIVE_TAG_CODES.has(x) || x === "spicy" || x === "not_spicy";
  });
  if (!affectsRecipes) return recipes;
  return recipes.filter((r) => recipeMatchesHouseholdDiet(r, selectedCodes));
}
