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

/** One week grid from SQLite recipe rows (cycles if fewer than 21 recipes). Each day includes an Extras cell for non-recipe groceries. */
export function weekPlanFromRecipes(
  recipes: { id: string; name: string }[]
): DayPlan[] {
  if (!recipes.length) return [];
  return DAYS.map((day, di) => {
    const recipeMeals: Meal[] = CATS.map((category, ci) => {
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
    });
    const extrasMeal: Meal = {
      id: `slot-${di}-extras`,
      name: "Day extras",
      brand: "Groceries",
      price: 0,
      weight: "Add items",
      image: "🛒",
      category: "extras",
      selected: true,
      extrasLines: [],
    };
    return { day, meals: [...recipeMeals, extrasMeal] };
  });
}
