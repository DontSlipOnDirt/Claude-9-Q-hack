import type { ApiRecipe } from "@/lib/api";
import { BREAKFAST_NAME_HINT, isBreakfastExclusiveMealTimes } from "@/lib/mealTimeHints";

/** Recipes tagged for this slot; if none match after filtering, fall back (breakfast uses name hints). */
export function recipesForMealCategory(recipes: ApiRecipe[], category: "breakfast" | "lunch" | "dinner"): ApiRecipe[] {
  const fit = recipes.filter((r) => {
    const mt = r.meal_times ?? [];
    if (mt.length === 0) return true;
    return mt.includes(category);
  });
  if (fit.length) return fit;
  if (category === "breakfast") {
    const hinted = recipes.filter((r) => BREAKFAST_NAME_HINT.test(r.name));
    if (hinted.length) return hinted;
    return recipes;
  }
  const sansBreakfastOnly = recipes.filter((r) => !isBreakfastExclusiveMealTimes(r.meal_times));
  if (sansBreakfastOnly.length) return sansBreakfastOnly;
  return recipes;
}
