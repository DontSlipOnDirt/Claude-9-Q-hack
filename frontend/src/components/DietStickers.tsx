/** Small emoji stickers from API `diet_tags` (`preference_tags.code` values). */

/** Slot metadata (`meal_times`); never show as user-facing tags. */
const MEAL_TIME_TAG_CODES = new Set(["breakfast", "lunch", "dinner"]);

/** True if there is at least one sticker to show after hiding meal-time codes. */
export function hasVisibleDietStickers(dietTags?: string[] | null): boolean {
  return (dietTags ?? []).some((c) => !MEAL_TIME_TAG_CODES.has(c));
}

const STICKERS: { code: string; emoji: string; label: string }[] = [
  { code: "vegan", emoji: "🌿", label: "Vegan" },
  { code: "vegetarian", emoji: "🥬", label: "Vegetarian" },
  { code: "halal", emoji: "☪️", label: "Halal" },
  { code: "gluten_free", emoji: "🌾", label: "Gluten-free" },
  { code: "spicy", emoji: "🔥", label: "Spicy / hot" },
];

type DietStickersProps = {
  dietTags?: string[] | null;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Renders one sticker per applicable tag. If the recipe is vegan, the vegetarian sticker is omitted.
 */
const DietStickers = ({ dietTags, className = "", size = "sm" }: DietStickersProps) => {
  const set = new Set((dietTags ?? []).filter((c) => !MEAL_TIME_TAG_CODES.has(c)));
  let items = STICKERS.filter((s) => set.has(s.code));
  if (set.has("vegan")) {
    items = items.filter((s) => s.code !== "vegetarian");
  }
  if (items.length === 0) return null;

  const box =
    size === "sm"
      ? "h-5 min-w-[1.1rem] px-0.5 text-[11px]"
      : "h-6 min-w-[1.25rem] px-1 text-[13px]";

  const shown = new Set(items.map((s) => s.code));
  const extraCodes = [...set].filter((code) => {
    if (!code || shown.has(code)) return false;
    if (code === "vegetarian" && set.has("vegan")) return false;
    return true;
  });

  return (
    <span
      className={`inline-flex items-center gap-0.5 flex-wrap ${className}`}
      aria-label="Recipe tags"
    >
      {items.map((s) => (
        <span
          key={s.code}
          title={s.label}
          className={`inline-flex items-center justify-center rounded-full bg-muted/90 ${box} leading-none shadow-sm border border-border/50`}
          role="img"
          aria-label={s.label}
        >
          {s.emoji}
        </span>
      ))}
      {extraCodes.map((code) => (
        <span
          key={code}
          title={code}
          className={`rounded-full bg-muted/60 px-1.5 text-[9px] font-medium text-muted-foreground border border-border/40 ${box}`}
        >
          {code.replace(/_/g, " ")}
        </span>
      ))}
    </span>
  );
};

export default DietStickers;
