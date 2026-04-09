import { Sparkles, AlertCircle, GripVertical } from "lucide-react";
import DietStickers from "@/components/DietStickers";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AI_RECIPE_DRAG_MIME } from "@/lib/dragAiRecipe";
export type AiDishMatch = { id: string; name: string; reason?: string; estimated_price?: number };

export interface AiSuggestionsSectionProps {
  aiMatches: AiDishMatch[];
  /** Count before client-side filters (e.g. hiding spicy) — for empty-state copy */
  sourceMatchCount?: number;
  aiLoading: boolean;
  aiError: string | null;
  aiCatalogEmpty: boolean;
  /** recipe id → diet tag codes from catalog */
  dietTagsByRecipeId?: Record<string, string[]>;
  /** Optional click-to-select (mobile friendly). */
  armedRecipeId?: string | null;
  onPickRecipe?: (recipe: { id: string; name: string; price: number }) => void;
}

const AiSuggestionsSection = ({
  aiMatches,
  sourceMatchCount,
  aiLoading,
  aiError,
  aiCatalogEmpty,
  dietTagsByRecipeId,
  armedRecipeId,
  onPickRecipe,
}: AiSuggestionsSectionProps) => {
  const hiddenByPreference =
    typeof sourceMatchCount === "number" && sourceMatchCount > 0 && aiMatches.length === 0;
  return (
    <div className="max-w-app mx-auto w-full px-4 mb-4">
      <div className="rounded-2xl border border-border bg-card/80 shadow-sm overflow-hidden">
        <div className="px-4 py-4">
          {aiError && (
            <Alert variant="destructive" className="py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Could not match dishes</AlertTitle>
              <AlertDescription className="text-sm">{aiError}</AlertDescription>
            </Alert>
          )}

          {aiLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!aiLoading && !aiError && aiMatches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {aiMatches.map((m) => (
                <Card
                  key={m.id}
                  draggable
                  onDragStart={(e) => {
                    const price = typeof m.estimated_price === "number" ? m.estimated_price : 0;
                    e.dataTransfer.setData(
                      AI_RECIPE_DRAG_MIME,
                      JSON.stringify({ id: m.id, name: m.name, price })
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    const price = typeof m.estimated_price === "number" ? m.estimated_price : 0;
                    onPickRecipe?.({ id: m.id, name: m.name, price });
                  }}
                  className={`overflow-hidden border-primary/15 bg-primary/5 cursor-grab active:cursor-grabbing select-none hover:border-primary/35 transition-colors ${
                    armedRecipeId === m.id ? "ring-2 ring-primary/60" : ""
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-base font-semibold text-foreground leading-snug">{m.name}</p>
                          <DietStickers
                            dietTags={dietTagsByRecipeId?.[m.id]}
                            className="shrink-0"
                          />
                        </div>
                        {typeof m.estimated_price === "number" && m.estimated_price > 0 ? (
                          <p className="text-sm font-semibold text-foreground mt-1">
                            {m.estimated_price.toFixed(2).replace(".", ",")} €
                          </p>
                        ) : null}
                        {m.reason ? (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{m.reason}</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!aiLoading && !aiError && aiCatalogEmpty && (
            <p className="text-sm text-muted-foreground italic">
              Nothing to show yet — try a shorter phrase (e.g. “pasta”, “chicken”, “vegetarian”).
            </p>
          )}

          {!aiLoading && !aiError && hiddenByPreference && (
            <p className="text-sm text-muted-foreground">
              Matches were spicy only — we’re not showing spicy dishes based on your recent swaps. Use{" "}
              <strong className="text-foreground">Suggest spicy meals again</strong> in Profile if you want them back.
            </p>
          )}

          {!aiLoading && !aiError && !aiCatalogEmpty && aiMatches.length === 0 && !hiddenByPreference && null}
        </div>
      </div>
    </div>
  );
};

export default AiSuggestionsSection;
