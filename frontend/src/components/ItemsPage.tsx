import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Tag, Sparkles, MapPin, Grid3X3, Star, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { productCategories, products, Product } from "@/data/meals";
import { fetchArticles, fetchRecipes, shoppingFromMeals, type ApiArticle } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ItemsPageProps {
  onAddToBasket: (product: Product) => void;
  onRemoveOneFromBasket: (productId: string) => void;
  basketQuantityById: Record<string, number>;
}

const filterTabs = [
  { id: "all", label: "All Products", icon: Grid3X3 },
  { id: "discount", label: "Discounts", icon: Tag },
  { id: "new", label: "New in App", icon: Sparkles },
  { id: "regional", label: "Regional", icon: MapPin },
  { id: "recipes", label: "All Recipes", icon: Star },
];

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

function ProductThumb({ image }: { image: string }) {
  const isUrl = image.startsWith("http") || image.startsWith("/");
  if (isUrl) {
    const needsBlend = image.startsWith("http");
    return (
      <div
        className={cn(
          "mb-2 h-20 w-full overflow-hidden rounded-md ring-1 ring-border/30",
          needsBlend ? "bg-muted" : "bg-muted/50"
        )}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "h-full w-full object-contain",
            needsBlend && "mix-blend-multiply dark:mix-blend-normal"
          )}
        />
      </div>
    );
  }
  return (
    <div className="h-20 flex items-center justify-center text-4xl mb-2">{image}</div>
  );
}

function formatEuro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function CatalogProductCard({
  product,
  inBasket,
  onAdd,
  onRemoveOne,
}: {
  product: Product;
  inBasket: number;
  onAdd: () => void;
  onRemoveOne: () => void;
}) {
  const picked = inBasket > 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col transition-colors duration-200",
        picked ? "border-border bg-muted/45" : "border-border bg-card hover:bg-muted/25"
      )}
    >
      <div className="relative rounded-lg">
        <ProductThumb image={product.image} />
        {product.discount && (
          <span className="absolute top-0 right-0 z-[1] bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            -{product.discount}%
          </span>
        )}
        {product.isNew && (
          <span className="absolute top-0 left-0 z-[1] bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            NEW
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
      <p className="text-xs text-muted-foreground">
        {[product.brand, product.weight].filter(Boolean).join(" · ")}
      </p>
      <div className="flex items-center justify-between mt-auto pt-2 gap-2 min-h-[2.25rem]">
        <div className="min-w-0">
          {product.discount ? (
            <>
              <span className="text-xs text-muted-foreground line-through mr-1">
                {product.price.toFixed(2).replace(".", ",")} €
              </span>
              <span className="text-sm font-bold text-primary">
                {(product.price * (1 - product.discount / 100)).toFixed(2).replace(".", ",")} €
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-foreground">
              {product.price.toFixed(2).replace(".", ",")} €
            </span>
          )}
        </div>
        {picked ? (
          <div
            className="flex h-9 shrink-0 items-stretch overflow-hidden rounded-full border border-border/80 bg-background/80 text-foreground shadow-sm"
            role="group"
            aria-label="Basket quantity"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveOne();
              }}
              className="flex w-9 items-center justify-center hover:bg-muted"
              aria-label="Remove one from basket"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="flex min-w-[2rem] items-center justify-center border-x border-border/80 text-sm font-semibold tabular-nums">
              {inBasket}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="flex w-9 items-center justify-center bg-primary text-primary-foreground hover:opacity-90"
              aria-label="Add one more"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
            aria-label="Add to basket"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

const ItemsPage = ({ onAddToBasket, onRemoveOneFromBasket, basketQuantityById }: ItemsPageProps) => {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const { data: apiArticles = [], isLoading: articlesLoading, isError: articlesError } = useQuery({
    queryKey: ["catalog-articles"],
    queryFn: fetchArticles,
    staleTime: 60_000,
  });

  const { data: apiRecipes = [], isLoading: recipesLoading, isError: recipesError } = useQuery({
    queryKey: ["catalog-recipes"],
    queryFn: fetchRecipes,
    staleTime: 60_000,
  });

  const recipeIdsKey = useMemo(
    () => [...apiRecipes].sort((a, b) => a.id.localeCompare(b.id)).map((r) => r.id).join("|"),
    [apiRecipes]
  );

  const { data: recipeShopData, isLoading: recipePricingLoading, isError: recipePricingError } = useQuery({
    queryKey: ["items-recipe-pricing", recipeIdsKey],
    queryFn: async () => {
      const res = await shoppingFromMeals(
        apiRecipes.map((r) => ({ recipe_id: r.id, label: r.id }))
      );
      const prices = new Map<string, number>();
      const linesByRecipe = new Map<string, typeof res.detail>();
      for (const row of res.detail) {
        prices.set(row.meal_label, (prices.get(row.meal_label) ?? 0) + row.line_total);
        const arr = linesByRecipe.get(row.meal_label) ?? [];
        arr.push(row);
        linesByRecipe.set(row.meal_label, arr);
      }
      return {
        priceById: Object.fromEntries(prices) as Record<string, number>,
        linesById: Object.fromEntries(linesByRecipe) as Record<string, typeof res.detail>,
      };
    },
    enabled: activeFilter === "recipes" && apiRecipes.length > 0,
    staleTime: 120_000,
  });

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apiRecipes;
    return apiRecipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [apiRecipes, search]);

  const selectedRecipe = selectedRecipeId
    ? apiRecipes.find((r) => r.id === selectedRecipeId) ?? null
    : null;
  const dialogLines = selectedRecipeId ? recipeShopData?.linesById[selectedRecipeId] ?? [] : [];
  const dialogTotal =
    selectedRecipeId && recipeShopData?.priceById[selectedRecipeId] != null
      ? recipeShopData.priceById[selectedRecipeId]
      : dialogLines.reduce((s, row) => s + row.line_total, 0);

  const catalogProducts = useMemo(() => apiArticles.map(articleToProduct), [apiArticles]);

  const mergedProducts = catalogProducts.length > 0 ? catalogProducts : products;

  const filtered = mergedProducts.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.brand.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (activeFilter === "discount" && !p.discount) return false;
    if (activeFilter === "new" && !p.isNew) return false;
    if (activeFilter === "regional" && !p.isRegional) return false;
    if (activeCategory && p.category !== activeCategory) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-6">
      {(articlesError || recipesError) && (
        <p className="text-sm text-destructive mb-4">
          Could not load catalog — start the API (<code className="text-xs">python main.py</code>) or use{" "}
          <code className="text-xs">npm run dev</code> with Vite proxy.
        </p>
      )}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activeFilter === "recipes" ? "Search recipes…" : "Search products…"}
          className="w-full pl-10 pr-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveFilter(tab.id);
                setActiveCategory(null);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === tab.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {(activeFilter !== "all" || search) && activeFilter !== "recipes" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">
              {search ? `Results for "${search}"` : filterTabs.find((f) => f.id === activeFilter)?.label}
            </h2>
            {articlesLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
            {filtered.map((product) => (
              <CatalogProductCard
                key={product.id}
                product={product}
                inBasket={basketQuantityById[product.id] ?? 0}
                onAdd={() => onAddToBasket(product)}
                onRemoveOne={() => onRemoveOneFromBasket(product.id)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">No products found</p>
            )}
          </div>
        </>
      )}

      {activeFilter !== "recipes" && (
        <>
          <h2 className="text-xl font-bold text-foreground mb-4">Discover More</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-8">
            {productCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted transition-colors border border-border ${
                  activeCategory === cat.id ? "bg-primary/10 border-primary" : "bg-secondary"
                }`}
              >
                <span className="text-3xl">{cat.emoji}</span>
                <span className="text-xs font-medium text-foreground text-center leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {activeCategory && activeFilter !== "recipes" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">
              {productCategories.find((c) => c.id === activeCategory)?.label}
            </h2>
            <button type="button" onClick={() => setActiveCategory(null)} className="text-sm text-primary font-medium">
              ← All Categories
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <CatalogProductCard
                key={product.id}
                product={product}
                inBasket={basketQuantityById[product.id] ?? 0}
                onAdd={() => onAddToBasket(product)}
                onRemoveOne={() => onRemoveOneFromBasket(product.id)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">No products found</p>
            )}
          </div>
        </>
      )}

      {activeFilter === "recipes" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Recipes from your catalog</h2>
            {(recipesLoading || recipePricingLoading) && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
          </div>
          {apiRecipes.length === 0 && !recipesLoading ? (
            <p className="text-center text-muted-foreground py-12">No recipes — check API and database.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredRecipes.map((r) => {
                const price = recipeShopData?.priceById[r.id];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecipeId(r.id);
                      setRecipeDialogOpen(true);
                    }}
                    className="bg-card border border-border rounded-xl p-3 flex flex-col text-left w-full hover:border-primary/40 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <div className="relative">
                      <div className="h-20 flex items-center justify-center text-4xl mb-2">🍽️</div>
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">Recipe</p>
                    <div className="mt-auto pt-2">
                      <span className="text-sm font-bold text-foreground">
                        {recipePricingLoading ? "…" : recipePricingError ? "—" : formatEuro(price ?? 0)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {filteredRecipes.length === 0 && apiRecipes.length > 0 && (
            <p className="text-center text-muted-foreground py-8">No recipes match your search.</p>
          )}

          <Dialog
            open={recipeDialogOpen}
            onOpenChange={(open) => {
              setRecipeDialogOpen(open);
              if (!open) setSelectedRecipeId(null);
            }}
          >
            <DialogContent className="flex w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:rounded-xl max-h-[85vh]">
              <DialogHeader className="shrink-0 border-b border-border p-5 pb-3 pr-12 text-left">
                <DialogTitle className="text-base leading-snug pr-2">{selectedRecipe?.name ?? "Recipe"}</DialogTitle>
                <DialogDescription className="text-xs">
                  Default articles for this recipe from your catalog (same as meal planner).
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[min(52vh,calc(85vh-11rem))] min-h-0 shrink overflow-y-auto overscroll-contain px-5 py-3">
                <ul className="space-y-2.5">
                  {recipePricingLoading && dialogLines.length === 0 && (
                    <li className="text-sm text-muted-foreground">Loading…</li>
                  )}
                  {dialogLines.length === 0 && !recipePricingLoading && (
                    <li className="text-sm text-muted-foreground">Nothing to show for this recipe.</li>
                  )}
                  {dialogLines.map((row, i) => (
                    <li
                      key={`${row.sku}-${row.ingredient_name}-${i}`}
                      className="flex justify-between gap-3 border-b border-border/60 pb-2.5 text-sm last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{row.article_name}</p>
                        <p className="text-xs text-muted-foreground">{row.ingredient_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.quantity}× @ {formatEuro(row.unit_price)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{formatEuro(row.line_total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0 border-t border-border bg-muted/30 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Estimated total</span>
                  <span className="text-base font-bold text-foreground">{formatEuro(dialogTotal)}</span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
};

export default ItemsPage;
