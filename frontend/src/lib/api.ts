import { inferMealTimesFromName } from "@/lib/mealTimeHints";

const jsonHeaders = { "Content-Type": "application/json" };

function messageFromErrorBody(text: string, fallback: string): string {
  const raw = text.trim();
  if (!raw) return fallback;
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      const parts = j.detail
        .map((x: { msg?: string }) => (typeof x?.msg === "string" ? x.msg : null))
        .filter(Boolean) as string[];
      if (parts.length) return parts.join("; ");
    }
  } catch {
    /* use raw body */
  }
  return raw;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorBody(text, res.statusText || String(res.status)));
  }
  return res.json() as Promise<T>;
}

export type HealthResponse = {
  status: string;
  /** Present when this server build includes GET/PUT recurring-manual (stale processes omit it). */
  recurring_staples_api?: boolean;
};

export async function getHealth(): Promise<HealthResponse> {
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
  /** From mapped catalog article; may be `/catalog/*.png` or remote URL. */
  image_url?: string | null;
  /** From catalog `articles.nutrition_table` (free text, e.g. "Calories: 18, ..."). */
  nutrition_table?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

/** First ingredient line image for planner thumbnails (avoids placeholder URLs). */
export function imageUrlFromShoppingDetailRow(row: Pick<ShoppingDetailRow, "image_url" | "sku">): string {
  const u = typeof row.image_url === "string" ? row.image_url.trim() : "";
  if (
    u &&
    !u.includes("placehold.co") &&
    (u.startsWith("http") || u.startsWith("/"))
  ) {
    return u;
  }
  return `/catalog/${encodeURIComponent(row.sku)}.png`;
}

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

/** Seed customer (`demo@picnic.com`) — matches `data/customers.csv`. */
export const PICNIC_DEMO_CUSTOMER_ID = "eeeeeeee-eeee-4eee-8eee-000000000001";

export type ApiDelivery = {
  id: string;
  timeslot: string;
  delivery_moment?: string | null;
  trip_id?: string | null;
  hub_id?: string | null;
  fc_id?: string | null;
  hub_address?: string | null;
  fc_address?: string | null;
};

export async function fetchDeliveries(): Promise<ApiDelivery[]> {
  const res = await fetch("/api/deliveries");
  return parseJson(res);
}

export type CreateOrderLinePayload = { sku: string; quantity: number };

export type CreateOrderPayload = {
  customer_id: string;
  delivery_id: string;
  status: string;
  creation_date: string;
  lines: CreateOrderLinePayload[];
  recipe_ids: string[];
};

export type CreateOrderResult = {
  order_id: string;
  total_price: number;
  lines: { id: string; sku: string; quantity: number; subtotal: number }[];
};

export async function createOrder(body: CreateOrderPayload): Promise<CreateOrderResult> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export type RecurringEligibleItem = {
  sku: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
  interval_days: number;
  source: string;
  last_ordered_at: string | null;
  suggested_quantity: number;
  eligible: boolean;
  next_eligible_after: string | null;
};

export type RecurringItemsResponse = {
  items: RecurringEligibleItem[];
  default_auto_interval_days: number;
  reference_date: string;
};

export async function fetchRecurringEligible(
  customerId: string,
  asOf?: string
): Promise<RecurringItemsResponse> {
  const q = new URLSearchParams();
  if (asOf) q.set("as_of", asOf);
  const qs = q.toString();
  const res = await fetch(
    `/api/customers/${encodeURIComponent(customerId)}/recurring-items${qs ? `?${qs}` : ""}`
  );
  return parseJson(res);
}

export type RecurringManualRow = {
  sku: string;
  interval_days: number;
  default_quantity: number;
  source: string;
  enabled: number;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
};

export async function fetchRecurringManual(customerId: string): Promise<RecurringManualRow[]> {
  const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/recurring-manual`);
  return parseJson(res);
}

export async function upsertRecurringManual(
  customerId: string,
  body: { sku: string; interval_days: number; default_quantity?: number }
): Promise<{ status: string; sku: string }> {
  const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/recurring-manual`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({
      sku: body.sku,
      interval_days: body.interval_days,
      default_quantity: body.default_quantity ?? 1,
    }),
  });
  return parseJson(res);
}

export async function deleteRecurringManual(
  customerId: string,
  sku: string
): Promise<{ status: string }> {
  const res = await fetch(
    `/api/customers/${encodeURIComponent(customerId)}/recurring-manual/${encodeURIComponent(sku)}`,
    { method: "DELETE" }
  );
  return parseJson(res);
}

export type VoiceTokenResponse = {
  token: string;
  model_id: string;
};

export async function getVoiceToken(): Promise<VoiceTokenResponse> {
  const res = await fetch("/api/voice/token", {
    method: "POST",
    headers: jsonHeaders,
  });
  return parseJson(res);
}

export async function speakText(text: string): Promise<Blob> {
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || res.statusText);
  }

  return res.blob();
}
