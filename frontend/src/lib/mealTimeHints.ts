/**
 * When `meal_times` is missing on the client (stale cache, proxy), infer from the recipe title
 * so breakfast / lunch / dinner pools still split correctly for week recommendations.
 */
export const BREAKFAST_NAME_HINT =
  /oatmeal|\boat\b|smoothie|yogurt|parfait|pancake|pancakes|egg|eggs|fruit|porridge|muffin|muffins|banana|cream|tortilla|scrambled|waffle|toast|omelet|omelette|granola|cereal|brunch|breakfast|frittata|croissant|bagel/i;

/** True when tagged only for breakfast (no lunch/dinner) — exclude from lunch/dinner pools. */
export function isBreakfastExclusiveMealTimes(mealTimes?: string[] | null): boolean {
  const mt = mealTimes ?? [];
  if (mt.length === 0) return false;
  return mt.includes("breakfast") && !mt.includes("lunch") && !mt.includes("dinner");
}

/**
 * When API omits `meal_times`, infer from the title.
 * Morning-style names map to breakfast only so they are not offered as lunch/dinner.
 */
export function inferMealTimesFromName(name: string): string[] {
  if (BREAKFAST_NAME_HINT.test(name)) return ["breakfast"];
  return ["lunch", "dinner"];
}
