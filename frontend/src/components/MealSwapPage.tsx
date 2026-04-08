import { ArrowLeft, RefreshCw } from "lucide-react";
import { Meal } from "@/data/meals";

interface MealSwapPageProps {
  meal: Meal;
  alternatives: Meal[];
  onBack: () => void;
  onSwap: (oldId: string, newMeal: Meal) => void;
}

const MealSwapPage = ({ meal, alternatives, onBack, onSwap }: MealSwapPageProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h2 className="font-bold text-foreground text-lg">Swap Meal</h2>
          <p className="text-xs text-muted-foreground">
            Replace <span className="font-medium text-foreground">{meal.name}</span> with an alternative
          </p>
        </div>
      </div>

      {/* Current meal */}
      <div className="max-w-2xl mx-auto w-full px-4 py-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Selection</p>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 mb-8 opacity-60">
          <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center text-3xl">{meal.image}</div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">{meal.name}</p>
            <p className="text-sm text-muted-foreground">{meal.brand}</p>
            <div className="flex gap-3 mt-1">
              <span className="text-sm font-bold text-foreground">{meal.price.toFixed(2).replace(".", ",")} €</span>
              {meal.calories && <span className="text-xs text-muted-foreground">🔥 {meal.calories} kcal</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Recommended Alternatives</p>
          <span className="text-xs text-muted-foreground ml-1">Based on your history</span>
        </div>

        <div className="space-y-3">
          {alternatives.map((alt) => (
            <div
              key={alt.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => onSwap(meal.id, alt)}
            >
              <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center text-3xl">{alt.image}</div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{alt.name}</p>
                <p className="text-sm text-muted-foreground">{alt.brand}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-sm font-bold text-foreground">{alt.price.toFixed(2).replace(".", ",")} €</span>
                  {alt.calories && <span className="text-xs text-muted-foreground">🔥 {alt.calories} kcal</span>}
                </div>
              </div>
              <button className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                Swap
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MealSwapPage;
