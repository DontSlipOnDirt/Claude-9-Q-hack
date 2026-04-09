import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayExtraLine, Meal, Product } from "@/data/meals";
import { fetchArticles, type ApiArticle } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function picnicCategoryToProductCategory(raw: string | null | undefined): string {
  const c = (raw || "").toLowerCase();
  if (c.includes("vegetable") || c.includes("fruit")) return "fruits";
  if (c.includes("dairy") || c.includes("milk") || c.includes("cheese") || c.includes("egg"))
    return "dairy";
  if (c.includes("meat") || c.includes("fish")) return "meat";
  if (c.includes("frozen")) return "frozen";
  if (c.includes("bread") || c.includes("cereal")) return "bread";
  if (c.includes("oil") || c.includes("sauce") || c.includes("pantry")) return "oils";
  if (c.includes("drink") || c.includes("water")) return "drinks";
  if (c.includes("snack") || c.includes("sweet") || c.includes("chocolate")) return "snacks";
  if (c.includes("coffee") || c.includes("tea")) return "coffee";
  if (c.includes("health") || c.includes("care")) return "health";
  if (c.includes("baby")) return "baby";
  return "cooking";
}

function articleToProduct(a: ApiArticle): Product {
  const category = picnicCategoryToProductCategory(a.category ?? undefined);
  const price = typeof a.price === "number" ? a.price : 0;
  const brandStr =
    typeof a.brand === "string" && a.brand.trim() ? a.brand.trim() : "";
  const rawCategory = typeof a.category === "string" && a.category.trim() ? a.category.trim() : "";
  const weightStr =
    typeof a.weight === "string" && a.weight.trim()
      ? a.weight.trim()
      : rawCategory || "Grocery";
  return {
    id: a.sku,
    name: a.name,
    brand: brandStr,
    price,
    weight: weightStr,
    image:
      typeof a.image_url === "string" &&
      (a.image_url.startsWith("http") || a.image_url.startsWith("/"))
        ? a.image_url
        : "🛒",
    category,
  };
}

interface DayExtrasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayLabel: string;
  meal: Meal | null;
  onApply: (lines: DayExtraLine[]) => void;
}

const DayExtrasDialog = ({ open, onOpenChange, dayLabel, meal, onApply }: DayExtrasDialogProps) => {
  const [search, setSearch] = useState("");
  const [localLines, setLocalLines] = useState<DayExtraLine[]>([]);

  useEffect(() => {
    if (!open || !meal) return;
    setLocalLines(meal.extrasLines?.map((l) => ({ ...l })) ?? []);
  }, [open, meal]);

  const { data: apiArticles = [] } = useQuery({
    queryKey: ["catalog-articles"],
    queryFn: fetchArticles,
    enabled: open,
    staleTime: 60_000,
  });

  const catalog = useMemo(() => apiArticles.map(articleToProduct), [apiArticles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const bump = (p: Product, delta: number) => {
    setLocalLines((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i < 0) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          {
            id: p.id,
            name: p.name,
            brand: p.brand,
            price: p.price,
            weight: p.weight,
            image: p.image,
            quantity: 1,
          },
        ];
      }
      const next = [...prev];
      const q = next[i].quantity + delta;
      if (q <= 0) next.splice(i, 1);
      else next[i] = { ...next[i], quantity: q };
      return next;
    });
  };

  const qtyFor = (id: string) => localLines.find((l) => l.id === id)?.quantity ?? 0;

  const handleDone = () => {
    onApply(localLines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-left">Extras for {dayLabel}</DialogTitle>
          <p className="text-xs text-muted-foreground text-left font-normal">
            Add normal groceries for this day. They are included when this cell is selected for checkout.
          </p>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
          {localLines.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                On this day
              </p>
              <ul className="space-y-2">
                {localLines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{line.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {line.brand} · {line.price.toFixed(2).replace(".", ",")} €
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="p-1.5 rounded-md border border-border hover:bg-muted"
                        onClick={() =>
                          setLocalLines((prev) => {
                            const i = prev.findIndex((x) => x.id === line.id);
                            if (i < 0) return prev;
                            const q = prev[i].quantity - 1;
                            if (q <= 0) return prev.filter((x) => x.id !== line.id);
                            const next = [...prev];
                            next[i] = { ...next[i], quantity: q };
                            return next;
                          })
                        }
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-semibold w-6 text-center tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        className="p-1.5 rounded-md border border-border hover:bg-muted"
                        onClick={() =>
                          setLocalLines((prev) => {
                            const i = prev.findIndex((x) => x.id === line.id);
                            if (i < 0) return prev;
                            const next = [...prev];
                            next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                            return next;
                          })
                        }
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Add from catalog
          </p>
          <div className="grid grid-cols-2 gap-2">
            {filtered.slice(0, 40).map((p) => {
              const q = qtyFor(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => bump(p, 1)}
                  className={cn(
                    "text-left rounded-lg border p-2.5 transition-colors",
                    q > 0 ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  )}
                >
                  <p className="text-xs font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.brand}</p>
                  <p className="text-xs font-bold mt-1">{p.price.toFixed(2).replace(".", ",")} €</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border bg-muted/20 shrink-0">
          <button
            type="button"
            className="px-4 py-2 rounded-full text-sm text-muted-foreground hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground"
            onClick={handleDone}
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DayExtrasDialog;
