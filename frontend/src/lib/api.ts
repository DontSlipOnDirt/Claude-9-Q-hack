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

export type ApiRecipe = { id: string; name: string };

export async function fetchRecipes(): Promise<ApiRecipe[]> {
  const res = await fetch("/api/catalog/recipes");
  return parseJson(res);
}

export type ApiCustomer = {
  id: string;
  name?: string;
  email?: string;
};

export async function fetchCustomers(): Promise<ApiCustomer[]> {
  const res = await fetch("/api/customers");
  return parseJson(res);
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
  model?: string
): Promise<MatchDishesResponse> {
  const res = await fetch("/api/catalog/match-dishes", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ query, model }),
  });
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

export type VoiceAgentTurnRequest = {
  customer_id: string;
  transcript?: string;
  initialize?: boolean;
  current_plan?: Array<Record<string, unknown>>;
  pending_actions?: Array<Record<string, unknown>>;
  confirmed_action_id?: string | null;
};

export type VoiceAgentTurnResponse = {
  assistant_text: string;
  tools_used: string[];
  requires_confirmation: boolean;
  proposed_actions: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
  applied_action?: Record<string, unknown> | null;
};

export async function voiceAgentTurn(
  body: VoiceAgentTurnRequest
): Promise<VoiceAgentTurnResponse> {
  const res = await fetch("/api/voice/agent/turn", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
