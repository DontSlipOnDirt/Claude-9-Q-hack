import { Sparkles, AlertCircle, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AI_RECIPE_DRAG_MIME } from "@/lib/dragAiRecipe";
export type AiDishMatch = { id: string; name: string; reason?: string };

export interface AiSuggestionsSectionProps {
  aiMatches: AiDishMatch[];
  aiLoading: boolean;
  aiError: string | null;
  aiCatalogEmpty: boolean;
}

const AiSuggestionsSection = ({
  aiMatches,
  aiLoading,
  aiError,
  aiCatalogEmpty,
}: AiSuggestionsSectionProps) => {
  return (
    <div className="max-w-6xl mx-auto w-full px-4 mb-4">
      <div className="rounded-2xl border border-border bg-card/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent shrink-0" />
            <div>
              <h3 className="font-bold text-foreground text-base leading-tight">AI suggestions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recipe ideas from your catalog — drag a card onto a breakfast, lunch, or dinner slot to replace that meal.
              </p>
            </div>
          </div>
        </div>
        <div className="px-4 py-4">
          {aiError && (
            <Alert variant="destructive" className="py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Could not match dishes</AlertTitle>
              <AlertDescription className="text-xs">{aiError}</AlertDescription>
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
                    e.dataTransfer.setData(AI_RECIPE_DRAG_MIME, JSON.stringify({ id: m.id, name: m.name }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="overflow-hidden border-primary/15 bg-primary/5 cursor-grab active:cursor-grabbing select-none hover:border-primary/35 transition-colors"
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground leading-snug">{m.name}</p>
                        {m.reason ? (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{m.reason}</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!aiLoading && !aiError && aiCatalogEmpty && (
            <p className="text-sm text-muted-foreground italic">No strong matches in the catalog — try different wording.</p>
          )}

          {!aiLoading && !aiError && !aiCatalogEmpty && aiMatches.length === 0 && (
            <p className="text-xs text-muted-foreground">Use the AI Meal Assistant above — suggestions appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiSuggestionsSection;
