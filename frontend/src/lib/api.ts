import { inferMealTimesFromName } from "@/lib/mealTimeHints";

const jsonHeaders = { "Content-Type": "application/json" };

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch("/api/health");
  return parseJson(res);
}

export type PreferenceTag = {
  id: string;
  code: string;
  name: string;
  tag_type: string;
  description: string;
};

/** All preference tags from SQLite (group by `tag_type` for dietary UI). */
export async function fetchPreferenceTags(): Promise<PreferenceTag[]> {
  const res = await fetch("/api/tags");
  return parseJson(res);
}

export type ApiArticle = {
  sku: string;
  name: string;
  category?: string | null;
  price?: number | null;
  brand?: string | null;
  weight?: string | null;
  image_url?: string | null;
};

export async function fetchArticles(): Promise<ApiArticle[]> {
  const res = await fetch("/api/catalog/articles");
  return parseJson(res);
}

export type ApiRecipe = {
  id: string;
  name: string;
  /** preference_tags.code values from recipe_tags join, e.g. vegan, halal, gluten_free */
  diet_tags?: string[];
  /** `breakfast` | `lunch` | `dinner` from recipe_tags with tag_type meal_time */
  meal_times?: string[];
};

export async function fetchRecipes(): Promise<ApiRecipe[]> {
  const res = await fetch("/api/catalog/recipes");
  const rows = await parseJson<ApiRecipe[] & { dietTags?: string[] }[]>(res);
  // FastAPI uses snake_case; some stacks rewrite JSON to camelCase — accept both.
  return rows.map((r) => {
    const tags = r.diet_tags ?? r.dietTags;
    const rawMt = r.meal_times ?? r.mealTimes;
    const mt = Array.isArray(rawMt) && rawMt.length > 0 ? rawMt : inferMealTimesFromName(r.name);
    return {
      ...r,
      diet_tags: Array.isArray(tags) ? tags : undefined,
      meal_times: mt,
    };
  });
}

export type MealPlanSlot = { recipe_id: string; label: string };

export type ShoppingDetailRow = {
  meal_label: string;
  recipe_id: string;
  recipe_name: string;
  ingredient_name: string;
  sku: string;
  article_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ShoppingCheckoutLine = {
  sku: string;
  quantity: number;
  name: string;
  unit_price: number;
  line_total: number;
};

export type ShoppingFromMealsResponse = {
  detail: ShoppingDetailRow[];
  checkout_lines: ShoppingCheckoutLine[];
};

export async function shoppingFromMeals(
  meals: MealPlanSlot[]
): Promise<ShoppingFromMealsResponse> {
  const res = await fetch("/api/catalog/shopping-from-meals", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ meals }),
  });
  return parseJson(res);
}

export type MatchDishesResponse = {
  matches: { id: string; name: string; reason?: string; estimated_price?: number }[];
};

export async function matchDishes(
  query: string,
  model?: string,
  dietaryNeeds?: string[]
): Promise<MatchDishesResponse> {
  const res = await fetch("/api/catalog/match-dishes", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      query,
      model,
      dietary_needs: dietaryNeeds?.length ? dietaryNeeds : undefined,
    }),
  });
  return parseJson(res);
}
