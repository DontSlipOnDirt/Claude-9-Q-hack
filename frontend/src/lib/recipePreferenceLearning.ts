/**
 * Learn recipe affinity from implicit feedback (swap/remove = dislike, pick/favourite/basket = like).
 * Scores rank eligible recipes in the weekly planner and swap picker — diet / meal-time constraints stay separate.
 */

const STORAGE_KEY = "picnic_recipe_preference_v1";

/** Dispatched only from `resetRecipePreferences` so the planner can rebuild with a clean slate. */
export const RECIPE_PREFERENCE_RESET_EVENT = "picnic-recipe-preference-reset";

const MIN_SCORE = -40;
const MAX_SCORE = 100;
/** User removed recipe, swapped away, or replaced with another. */
const DELTA_REJECT = 1.6;
/** User explicitly placed this recipe (drag from AI, etc.). */
const DELTA_EXPLICIT_PICK = 1.15;
/** Heart / favourite. */
const DELTA_FAVOURITE = 1.25;
/** Added recipe ingredients to basket from detail. */
const DELTA_BASKET_ADD = 0.75;

type Stored = { scores: Record<string, number> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clamp(n: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, n));
}

export function loadRecipePreferenceScores(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return {};
    const scores = p.scores;
    if (!isRecord(scores)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(scores: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = { scores };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

function bump(recipeId: string, delta: number): void {
  const id = recipeId.trim();
  if (!id) return;
  const scores = { ...loadRecipePreferenceScores() };
  scores[id] = clamp((scores[id] ?? 0) + delta);
  persist(scores);
}

export function recordRecipeRejected(recipeId: string): void {
  bump(recipeId, -DELTA_REJECT);
}

export function recordRecipeExplicitPick(recipeId: string): void {
  bump(recipeId, DELTA_EXPLICIT_PICK);
}

export function recordRecipeFavourited(recipeId: string): void {
  bump(recipeId, DELTA_FAVOURITE);
}

export function recordRecipeBasketAdd(recipeId: string): void {
  bump(recipeId, DELTA_BASKET_ADD);
}

export function resetRecipePreferences(): void {
  persist({});
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RECIPE_PREFERENCE_RESET_EVENT));
  }
}

/** Stable sort: higher learned score first, then name. */
export function sortRecipesByLearnedPreference<T extends { id: string; name: string }>(
  recipes: T[],
  scores: Record<string, number> = loadRecipePreferenceScores()
): T[] {
  return [...recipes].sort((a, b) => {
    const da = scores[a.id] ?? 0;
    const db = scores[b.id] ?? 0;
    if (db !== da) return db - da;
    return a.name.localeCompare(b.name);
  });
}
