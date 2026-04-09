import { useMemo, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { BasketIngredient } from "@/components/CheckoutSidebar";
import { cn } from "@/lib/utils";

interface WeekGroceriesSectionProps {
  basketIngredients: BasketIngredient[];
  ingredientsTotal: number;
}

function groupKey(item: BasketIngredient): string {
  return item.fromMeal ?? item.sourceLabel ?? "Other";
}

function BasketLineThumb({ image }: { image: string }) {
  const [broken, setBroken] = useState(false);
  const isUrl = (image.startsWith("http") || image.startsWith("/")) && !broken;
  if (isUrl) {
    return (
      <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-muted/50 ring-1 ring-border/20 shrink-0">
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 bg-muted rounded-md flex items-center justify-center text-sm shrink-0">
      {broken ? "🛒" : image}
    </div>
  );
}

const WeekGroceriesSection = ({ basketIngredients, ingredientsTotal }: WeekGroceriesSectionProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, BasketIngredient[]>();
    for (const item of basketIngredients) {
      const k = groupKey(item);
      const list = map.get(k) ?? [];
      list.push(item);
      map.set(k, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [basketIngredients]);

  const lineCount = basketIngredients.length;

  return (
    <div className="max-w-app mx-auto w-full px-4 mb-4">
      <div className="rounded-2xl border border-border bg-card/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBasket className="w-5 h-5 text-primary shrink-0" />
            <div>
              <h3 className="font-bold text-foreground text-lg leading-tight">Week groceries</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {lineCount === 0
                  ? "Select meals or add items from the catalog"
                  : `${lineCount} line${lineCount === 1 ? "" : "s"} · ${ingredientsTotal.toFixed(2).replace(".", ",")} €`}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Your list</p>

          {grouped.length === 0 ? (
            <p className="text-base text-muted-foreground italic py-2">No groceries yet for this week.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([label, items]) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
                  <ul className="space-y-0 divide-y divide-border rounded-lg border border-border overflow-hidden bg-background/50">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <BasketLineThumb image={item.image} />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[item.brand, item.weight].filter(Boolean).join(" · ")}
                            {item.sourceLabel ? ` · ${item.sourceLabel}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0",
                          )}
                        >
                          ×{item.quantity}
                        </span>
                        <span className="text-base font-semibold text-foreground tabular-nums w-[4.25rem] text-right shrink-0">
                          {(item.price * item.quantity).toFixed(2).replace(".", ",")} €
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeekGroceriesSection;
