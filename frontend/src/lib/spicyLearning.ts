/**
 * Learn from repeated rejection of spicy-tagged meals (swap away / deselect).
 * Before learning kicks in, the planner pool interleaves spicy and non-spicy so both appear.
 * After enough rejections we exclude spicy (until reset in Profile).
 */

import type { ApiRecipe } from "@/lib/api";

const STORAGE_KEY = "picnic_spicy_learning_v1";

/** Fired when counts or avoid flag change so the planner can refetch ordering rules. */
export const SPICY_LEARNING_EVENT = "picnic-spicy-learning-changed";

export const SPICY_LEARNING_THRESHOLD = 3;

export type SpicyLearningState = {
  spicyRejectCount: number;
  /** When true, spicy recipes are excluded from the planner. */
  avoidSpicy: boolean;
};

const defaults: SpicyLearningState = {
  spicyRejectCount: 0,
  avoidSpicy: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadSpicyLearning(): SpicyLearningState {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return { ...defaults };
    const spicyRejectCount =
      typeof p.spicyRejectCount === "number" && p.spicyRejectCount >= 0
        ? Math.floor(p.spicyRejectCount)
        : defaults.spicyRejectCount;
    const avoidSpicy = typeof p.avoidSpicy === "boolean" ? p.avoidSpicy : defaults.avoidSpicy;
    return { spicyRejectCount, avoidSpicy };
  } catch {
    return { ...defaults };
  }
}

function persist(state: SpicyLearningState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Call when the user clearly rejects a spicy meal (deselects it, or swaps/replaces it with a non-spicy option).
 * @returns true if we just crossed the threshold and started avoiding spicy.
 */
export function recordSpicyReject(): boolean {
  const s = loadSpicyLearning();
  if (s.avoidSpicy) return false;
  const nextCount = s.spicyRejectCount + 1;
  const crossed = nextCount >= SPICY_LEARNING_THRESHOLD;
  persist({ spicyRejectCount: nextCount, avoidSpicy: crossed });
  if (crossed && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPICY_LEARNING_EVENT));
  }
  return crossed;
}

export function resetSpicyAvoid(): void {
  persist({ spicyRejectCount: 0, avoidSpicy: false });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPICY_LEARNING_EVENT));
  }
}

export function mealHasSpicyTag(dietTags?: string[] | null): boolean {
  return Boolean(dietTags?.includes("spicy"));
}

/** Exclude spicy recipes when the user has consistently rejected them (learned). */
export function applySpicyPoolRules<T extends Pick<ApiRecipe, "name" | "diet_tags">>(
  recipes: T[],
  avoidSpicy: boolean
): T[] {
  if (!avoidSpicy) return recipes;
  return recipes.filter((r) => !r.diet_tags?.includes("spicy"));
}

/**
 * Alternate spicy- and non-spicy-tagged recipes so the weekly grid surfaces both when the pool has both.
 * Preserves relative order within each group. No-op if only one group exists.
 */
export function interleaveSpicyAndNonSpicyRecipes<T extends Pick<ApiRecipe, "diet_tags">>(recipes: T[]): T[] {
  const spicy: T[] = [];
  const mild: T[] = [];
  for (const r of recipes) {
    if (r.diet_tags?.includes("spicy")) spicy.push(r);
    else mild.push(r);
  }
  if (spicy.length === 0 || mild.length === 0) return recipes;
  const out: T[] = [];
  const n = Math.max(spicy.length, mild.length);
  for (let k = 0; k < n; k++) {
    if (k < spicy.length) out.push(spicy[k]);
    if (k < mild.length) out.push(mild[k]);
  }
  return out;
}
