import type { DayPlan, Meal } from "@/data/meals";
import { BREAKFAST_NAME_HINT, isBreakfastExclusiveMealTimes } from "@/lib/mealTimeHints";
import { interleaveSpicyAndNonSpicyRecipes } from "@/lib/spicyLearning";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Recent lunch + dinner picks to spread repeats across the week (~3 days). */
const MAIN_MEAL_RECENCY_SLOTS = 6;

type RecipeRow = { id: string; name: string; diet_tags?: string[]; meal_times?: string[] };

function pushRecentMain(queue: string[], id: string): void {
  queue.push(id);
  while (queue.length > MAIN_MEAL_RECENCY_SLOTS) queue.shift();
}

/** First recipe in rotation starting at `startIdx` whose id is not in `forbidden`. */
function pickAvoiding<T extends { id: string }>(pool: T[], startIdx: number, forbidden: Set<string>): T {
  const n = pool.length;
  for (let k = 0; k < n; k++) {
    const r = pool[(startIdx + k) % n];
    if (!forbidden.has(r.id)) return r;
  }
  return pool[startIdx % n];
}

function poolForCategory(recipes: RecipeRow[], category: "breakfast" | "lunch" | "dinner"): RecipeRow[] {
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
  // Lunch/dinner: do not fall back to breakfast-only recipes (smoothie, porridge, etc.).
  const sansBreakfastOnly = recipes.filter((r) => !isBreakfastExclusiveMealTimes(r.meal_times));
  if (sansBreakfastOnly.length) return sansBreakfastOnly;
  return recipes;
}

/** One week grid from SQLite recipe rows. Breakfast / lunch / dinner use meal_time–tagged pools when available. */
export function weekPlanFromRecipes(recipes: RecipeRow[]): DayPlan[] {
  if (!recipes.length) return [];
  const slotPools = (["breakfast", "lunch", "dinner"] as const).map((cat) =>
    interleaveSpicyAndNonSpicyRecipes(poolForCategory(recipes, cat))
  );
  const breakfastPool = slotPools[0];
  const lunchPool = slotPools[1];
  const dinnerPool = slotPools[2];
  const recentMain: string[] = [];

  return DAYS.map((day, di) => {
    const breakfast = breakfastPool[di % breakfastPool.length];
    const lunch = pickAvoiding(lunchPool, di, new Set(recentMain));
    pushRecentMain(recentMain, lunch.id);
    const dinner = pickAvoiding(dinnerPool, di + 1, new Set(recentMain));
    pushRecentMain(recentMain, dinner.id);

    const rows: { category: Meal["category"]; r: RecipeRow }[] = [
      { category: "breakfast", r: breakfast },
      { category: "lunch", r: lunch },
      { category: "dinner", r: dinner },
    ];

    const recipeMeals: Meal[] = rows.map(({ category, r }, ci) => {
      const slotId = `slot-${di}-${ci}-${r.id}`;
      const tags = r.diet_tags?.length ? [...r.diet_tags] : undefined;
      const meal: Meal = {
        id: slotId,
        name: r.name,
        brand: "Picnic",
        price: 0,
        weight: "1 serving",
        image: "🍽️",
        category,
        selected: true,
        recipeId: r.id,
        dietTags: tags,
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
