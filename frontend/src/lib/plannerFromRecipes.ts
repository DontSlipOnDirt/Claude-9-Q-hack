import type { DayPlan, Meal } from "@/data/meals";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const CATS: Meal["category"][] = ["breakfast", "lunch", "dinner"];

/** One week grid from SQLite recipe rows (cycles if fewer than 21 recipes). */
export function weekPlanFromRecipes(
  recipes: { id: string; name: string }[]
): DayPlan[] {
  if (!recipes.length) return [];
  return DAYS.map((day, di) => ({
    day,
    meals: CATS.map((category, ci) => {
      const idx = (di * 3 + ci) % recipes.length;
      const r = recipes[idx];
      const slotId = `slot-${di}-${ci}-${r.id}`;
      const meal: Meal = {
        id: slotId,
        name: r.name,
        brand: "Picnic",
        price: 0,
        weight: "1 serving",
        image: "🍽️",
        category,
        selected: true,
        calories: 400,
        recipeId: r.id,
      };
      return meal;
    }),
  }));
}
