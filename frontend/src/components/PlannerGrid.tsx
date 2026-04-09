import { useState, useEffect } from "react";
import { X, Heart, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { DayPlan } from "@/data/meals";
import DietStickers, { hasVisibleDietStickers } from "@/components/DietStickers";
import { parseAiRecipeDrag } from "@/lib/dragAiRecipe";
import { cn } from "@/lib/utils";

interface PlannerGridProps {
  filteredPlan: DayPlan[];
  activeMealFilters: string[];
  /** Remove recipe from slot (or clear extras). */
  onRemoveMeal: (id: string) => void;
  onClickMeal: (id: string) => void;
  onRemoveColumn: (category: string) => void;
  onToggleFavourite?: (id: string) => void;
  favouriteIds?: string[];
  onSwapMeal?: (id: string) => void;
  /** Drop an AI-suggested recipe onto a meal slot (not extras). */
  onDropAiRecipe?: (mealId: string, recipe: { id: string; name: string; price: number }) => void;
}

const categoryLabel: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  extras: "Extras",
};

const cardThemes = [
  { bg: "bg-card-warm", border: "border-orange-200", dot: "bg-orange-400" },
  { bg: "bg-card-cool", border: "border-blue-200", dot: "bg-blue-400" },
  { bg: "bg-card-fresh", border: "border-emerald-200", dot: "bg-emerald-400" },
  { bg: "bg-muted/40", border: "border-violet-200", dot: "bg-violet-400" },
];

const CARDS_PER_PAGE = 3;

function PlannerMealThumb({ image }: { image: string }) {
  const [broken, setBroken] = useState(false);
  const isRemoteOrLocal = (image.startsWith("http") || image.startsWith("/")) && !broken;
  if (isRemoteOrLocal) {
    return (
      <div className="w-11 h-11 bg-muted/40 rounded-lg overflow-hidden flex-shrink-0 shadow-sm ring-1 ring-border/25">
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className="w-11 h-11 bg-background rounded-lg flex items-center justify-center text-xl flex-shrink-0 shadow-sm ring-1 ring-border/20">
      {broken ? "🍽️" : image}
    </div>
  );
}

const PlannerGrid = ({
  filteredPlan,
  activeMealFilters,
  onRemoveMeal,
  onClickMeal,
  onRemoveColumn,
  onToggleFavourite,
  favouriteIds = [],
  onSwapMeal,
  onDropAiRecipe,
}: PlannerGridProps) => {
  const [page, setPage] = useState(0);
  const [dragOverMealId, setDragOverMealId] = useState<string | null>(null);

  useEffect(() => {
    const clear = () => setDragOverMealId(null);
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);
  const totalPages = Math.ceil(filteredPlan.length / CARDS_PER_PAGE);
  const visibleDays = filteredPlan.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE);

  const visibleCategories = ["breakfast", "lunch", "dinner", "extras"].filter(
    (c) => activeMealFilters.length === 0 || activeMealFilters.includes(c)
  );

  return (
    <div className="space-y-4">
      {/* Navigation arrows + cards */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="p-2 rounded-full bg-secondary hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>

        <div className="flex-1 grid grid-cols-3 gap-4">
          {visibleDays.map((day, idx) => {
            const theme = cardThemes[idx % cardThemes.length];
            return (
              <div
                key={day.day}
                className={`${theme.bg} ${theme.border} border rounded-2xl p-5 flex flex-col transition-all hover:shadow-lg`}
              >
                <h3 className="text-center font-bold text-foreground text-xl mb-4 pb-3 border-b border-border/50">
                  {day.day}
                </h3>

                <div className="space-y-3 flex-1">
                  {visibleCategories.map((cat) => {
                    const meal = day.meals.find((m) => m.category === cat);
                    if (!meal) return null;
                    const isExtras = meal.category === "extras";
                    const extraLines = meal.extrasLines ?? [];
                    const extraUnits = extraLines.reduce((s, x) => s + x.quantity, 0);
                    const extraTotal = extraLines.reduce((s, x) => s + x.price * x.quantity, 0);
                    /** Cleared by user (X); seed/API meals without recipeId still show until cleared. */
                    const isEmptySlot = !isExtras && !meal.recipeId && meal.name === "Add a recipe";
                    const showRemove = isExtras ? extraUnits > 0 : !isEmptySlot;
                    return (
                      <div key={cat}>
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          {categoryLabel[cat]}
                        </p>
                        <div
                          className={cn(
                            "relative rounded-xl p-3 transition-all cursor-pointer group",
                            !isExtras && isEmptySlot
                              ? "bg-muted/40 border border-dashed border-muted-foreground/25 opacity-90"
                              : meal.selected
                                ? "bg-card border border-border/60 shadow-sm hover:shadow-md"
                                : "bg-muted/40 border border-dashed border-muted-foreground/20 opacity-50",
                            !isExtras &&
                              onDropAiRecipe &&
                              dragOverMealId === meal.id &&
                              "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          )}
                          onClick={() => onClickMeal(meal.id)}
                          onDragOver={
                            isExtras || !onDropAiRecipe
                              ? undefined
                              : (e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "copy";
                                  setDragOverMealId(meal.id);
                                }
                          }
                          onDrop={
                            isExtras || !onDropAiRecipe
                              ? undefined
                              : (e) => {
                                  e.preventDefault();
                                  setDragOverMealId(null);
                                  const recipe = parseAiRecipeDrag(e.dataTransfer);
                                  if (recipe) onDropAiRecipe(meal.id, recipe);
                                }
                          }
                        >
                          {/* Action buttons */}
                          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onToggleFavourite && !isExtras && !isEmptySlot && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavourite(meal.id);
                                }}
                                className="bg-card/90 backdrop-blur-sm rounded-full p-1.5 shadow hover:scale-110 transition-transform"
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    favouriteIds.includes(meal.id)
                                      ? "text-primary fill-primary"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </button>
                            )}
                            {onSwapMeal && !isExtras && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSwapMeal(meal.id);
                                }}
                                className="bg-card/90 backdrop-blur-sm rounded-full p-1.5 shadow hover:scale-110 transition-transform"
                                title="Swap for another recipe"
                              >
                                <RefreshCw className="w-3.5 h-3.5 text-primary" />
                              </button>
                            )}
                            {showRemove && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveMeal(meal.id);
                                }}
                                className="bg-card/90 backdrop-blur-sm rounded-full p-1.5 shadow hover:scale-110 transition-transform"
                                title={isExtras ? "Clear groceries" : "Remove recipe"}
                              >
                                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <PlannerMealThumb image={meal.image} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {isExtras
                                  ? extraUnits > 0
                                    ? `Groceries (${extraUnits})`
                                    : "Add groceries"
                                  : isEmptySlot
                                    ? "Add a recipe"
                                    : meal.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-base font-bold text-foreground">
                                  {isExtras
                                    ? extraUnits > 0
                                      ? `${extraTotal.toFixed(2).replace(".", ",")} €`
                                      : "—"
                                    : `${meal.price.toFixed(2).replace(".", ",")} €`}
                                </span>
                                {isExtras && extraUnits > 0 && (
                                  <span className="text-xs text-muted-foreground">Groceries</span>
                                )}
                                {!isExtras && meal.calories && (
                                  <span className="text-xs text-muted-foreground">
                                    ⚡ {meal.calories} kcal
                                  </span>
                                )}
                              </div>
                              {!isExtras && hasVisibleDietStickers(meal.dietTags) && (
                                <div className="mt-1.5 pl-0">
                                  <DietStickers dietTags={meal.dietTags} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="p-2 rounded-full bg-secondary hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronRight className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Pagination dots */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`w-3 h-3 rounded-full transition-all ${
              i === page ? "bg-primary scale-110" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>

      {/* Restore hidden columns */}
      {visibleCategories.length < 4 && (
        <div className="flex items-center gap-2 px-3 flex-wrap">
          <span className="text-sm text-muted-foreground">Hidden:</span>
          {["breakfast", "lunch", "dinner", "extras"]
            .filter((c) => !visibleCategories.includes(c))
            .map((cat) => (
              <button
                key={cat}
                onClick={() => onRemoveColumn(cat)}
                className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
              >
                + Show {categoryLabel[cat]}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default PlannerGrid;
