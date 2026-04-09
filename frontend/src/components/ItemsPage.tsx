import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Tag, Sparkles, MapPin, Grid3X3, Star, Plus, Minus, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { productCategories, products, Product } from "@/data/meals";
import {
  deleteRecurringManual,
  fetchArticles,
  fetchRecurringManual,
  fetchRecipes,
  getHealth,
  shoppingFromMeals,
  upsertRecurringManual,
  type ApiArticle,
  type HealthResponse,
} from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DietStickers, { hasVisibleDietStickers } from "@/components/DietStickers";

/** Matches catalog SKUs backed by SQLite (recurring API). */
const CATALOG_SKU_RE = /^[A-Z0-9]+-[A-Z0-9]+-\d{3}$/;

interface ItemsPageProps {
  customerId: string;
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

function resolveArticleImage(sku: string, imageUrl: string | null | undefined): string {
  const raw = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (
    raw &&
    !raw.includes("placehold.co") &&
    (raw.startsWith("http") || raw.startsWith("/"))
  ) {
    return raw;
  }
  return `/catalog/${encodeURIComponent(sku)}.png`;
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
    image: resolveArticleImage(a.sku, a.image_url),
    category,
  };
}

function ProductThumb({ image }: { image: string }) {
  const [broken, setBroken] = useState(false);
  const isUrl = (image.startsWith("http") || image.startsWith("/")) && !broken;
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
          onError={() => setBroken(true)}
          className={cn(
            "h-full w-full object-contain",
            needsBlend && "mix-blend-multiply dark:mix-blend-normal"
          )}
        />
      </div>
    );
  }
  return (
    <div className="h-20 flex items-center justify-center text-4xl mb-2">{broken ? "🛒" : image}</div>
  );
}

function formatEuro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

const WHEEL_ITEM_PX = 44;
const WHEEL_VIEW_H = 220;

const STAPLE_INTERVAL_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const STAPLE_QTY_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

/** Vertical scroll-snap columns like mobile alarm time pickers (drum / wheel). */
function AlarmStyleWheel({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pad = (WHEEL_VIEW_H - WHEEL_ITEM_PX) / 2;

  const indexOf = (v: number) => {
    const i = options.findIndex((o) => o.value === v);
    return i >= 0 ? i : 0;
  };

  // Align scroll once on mount; remount via `key` when the dialog reopens or server data arrives.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = indexOf(value);
    el.scrollTo({ top: i * WHEEL_ITEM_PX, behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not re-sync on every value change while dragging
  }, []);

  const snapFromScroll = () => {
    const el = ref.current;
    if (!el) return;
    const raw = el.scrollTop / WHEEL_ITEM_PX;
    const i = Math.max(0, Math.min(options.length - 1, Math.round(raw)));
    el.scrollTo({ top: i * WHEEL_ITEM_PX, behavior: "smooth" });
    const next = options[i]?.value;
    if (next !== undefined && next !== value) onChange(next);
  };

  const onScroll = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(snapFromScroll, 100);
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[100px] sm:max-w-[120px]"
      style={{ height: WHEEL_VIEW_H }}
      role="listbox"
      aria-label={ariaLabel}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[52px] rounded-t-2xl bg-gradient-to-b from-card from-40% via-card/85 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[52px] rounded-b-2xl bg-gradient-to-t from-card from-40% via-card/85 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 rounded-full border border-primary/40 bg-primary/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        aria-hidden
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingTop: pad, paddingBottom: pad }}
      >
        {options.map((opt) => (
          <div
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            className={cn(
              "flex h-11 shrink-0 snap-center snap-always items-center justify-center text-[1.35rem] font-semibold tabular-nums transition-all duration-150",
              opt.value === value ? "scale-105 text-foreground" : "text-muted-foreground/75"
            )}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalogProductCard({
  product,
  inBasket,
  onAdd,
  onRemoveOne,
  showStaple,
  isStaple,
  onStapleClick,
}: {
  product: Product;
  inBasket: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  showStaple: boolean;
  isStaple: boolean;
  onStapleClick: () => void;
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
        {isStaple && (
          <span className="absolute top-0 left-0 z-[1] bg-foreground/90 text-background text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            Staple
          </span>
        )}
        {product.discount && (
          <span className="absolute top-0 right-0 z-[1] bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            -{product.discount}%
          </span>
        )}
        {product.isNew && !isStaple && (
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
        <div className="min-w-0 flex-1">
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
        <div className="flex shrink-0 items-center gap-1">
          {showStaple && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStapleClick();
              }}
              className={cn(
                "flex h-9 min-w-[3.25rem] shrink-0 items-center justify-center gap-0.5 rounded-xl border px-1.5 transition-colors",
                isStaple
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-border bg-secondary/90 text-muted-foreground hover:border-primary/25 hover:bg-muted hover:text-foreground"
              )}
              title={isStaple ? "Edit recurring staple" : "Mark as recurring staple"}
              aria-label={isStaple ? "Edit recurring staple" : "Mark as recurring staple"}
            >
              <Bookmark
                className={cn(
                  "h-3.5 w-3.5 shrink-0 stroke-[2.25]",
                  isStaple && "fill-primary stroke-primary text-primary"
                )}
              />
              <span className="text-[10px] font-bold leading-none tracking-tight">Recur</span>
            </button>
          )}
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
    </div>
  );
}

const ItemsPage = ({
  customerId,
  onAddToBasket,
  onRemoveOneFromBasket,
  basketQuantityById,
}: ItemsPageProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [stapleDialogProduct, setStapleDialogProduct] = useState<Product | null>(null);
  const [stapleInterval, setStapleInterval] = useState(14);
  const [stapleQty, setStapleQty] = useState(1);
  const [stapleWheelReset, setStapleWheelReset] = useState(0);

  const { data: apiArticles = [], isLoading: articlesLoading, isError: articlesError } = useQuery({
    queryKey: ["catalog-articles"],
    queryFn: fetchArticles,
    staleTime: 60_000,
  });

  const { data: apiHealth } = useQuery({
    queryKey: ["api-health"],
    queryFn: getHealth,
    staleTime: 15_000,
  });

  const { data: manualStaples = [] } = useQuery({
    queryKey: ["recurring-manual", customerId],
    queryFn: () => fetchRecurringManual(customerId),
    staleTime: 30_000,
  });

  const stapleBySku = useMemo(() => {
    const m = new Map<string, { interval_days: number; default_quantity: number }>();
    for (const row of manualStaples) {
      m.set(row.sku, { interval_days: row.interval_days, default_quantity: row.default_quantity });
    }
    return m;
  }, [manualStaples]);

  const saveStaple = useMutation({
    mutationFn: (vars: { sku: string; interval_days: number; default_quantity: number }) =>
      upsertRecurringManual(customerId, vars),
    onSuccess: () => {
      toast.success("Recurring staple saved");
      queryClient.invalidateQueries({ queryKey: ["recurring-manual", customerId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-eligible", customerId] });
      setStapleDialogProduct(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not save staple";
      const health = queryClient.getQueryData<HealthResponse>(["api-health"]);
      const hint =
        /not found/i.test(msg) && health?.recurring_staples_api !== true
          ? " Stop the API (Ctrl+C), then run python main.py again from the project root."
          : "";
      toast.error(msg + hint);
    },
  });

  const removeStaple = useMutation({
    mutationFn: (sku: string) => deleteRecurringManual(customerId, sku),
    onSuccess: () => {
      toast.success("Removed from staples");
      queryClient.invalidateQueries({ queryKey: ["recurring-manual", customerId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-eligible", customerId] });
      setStapleDialogProduct(null);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not remove staple"),
  });

  const openStapleDialog = (product: Product) => setStapleDialogProduct(product);

  useEffect(() => {
    if (!stapleDialogProduct) return;
    const existing = stapleBySku.get(stapleDialogProduct.id);
    const d = existing?.interval_days ?? 14;
    setStapleInterval(Math.min(30, Math.max(1, d)));
    const q = existing?.default_quantity ?? 1;
    setStapleQty(Math.min(30, Math.max(1, q)));
  }, [stapleDialogProduct, stapleBySku]);

  const stapleSyncKey = stapleDialogProduct
    ? `${stapleDialogProduct.id}:${stapleBySku.get(stapleDialogProduct.id)?.interval_days ?? "—"}:${stapleBySku.get(stapleDialogProduct.id)?.default_quantity ?? "—"}:${manualStaples.length}`
    : null;

  useEffect(() => {
    if (stapleSyncKey == null) return;
    setStapleWheelReset((n) => n + 1);
  }, [stapleSyncKey]);

  const catalogBacked = apiArticles.length > 0;
  const staleRecurringServer =
    catalogBacked &&
    apiHealth?.status === "ok" &&
    apiHealth.recurring_staples_api !== true;

  const { data: apiRecipes = [], isLoading: recipesLoading, isError: recipesError } = useQuery({
    queryKey: ["catalog-recipes", "diet-tags-v12"],
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
    <div className="max-w-app mx-auto w-full px-4 py-6">
      {(articlesError || recipesError) && (
        <p className="text-sm text-destructive mb-4">
          Could not load catalog — start the API (<code className="text-xs">python main.py</code>) or use{" "}
          <code className="text-xs">npm run dev</code> with Vite proxy.
        </p>
      )}
      {staleRecurringServer && (
        <p
          className="text-sm text-amber-950 dark:text-amber-100 bg-amber-100/90 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-800 rounded-xl px-4 py-3 mb-4"
          role="status"
        >
          <span className="font-semibold">Recurring staples need a fresh API process.</span> The server on port 8000 is
          running old code (no <code className="text-xs">/recurring-manual</code> routes). In the terminal where the API
          runs, press <kbd className="px-1 rounded bg-background/60 text-xs">Ctrl+C</kbd>, then start again:{" "}
          <code className="text-xs">python main.py</code> from the project root. Reload this page after it starts.
        </p>
      )}
      {activeFilter !== "recipes" && !recipesError && (
        <p className="text-xs text-muted-foreground mb-3">
          Diet tags (Spicy 🔥, vegan, …) appear on <strong className="text-foreground">recipe</strong> cards — open the{" "}
          <strong className="text-foreground">All Recipes</strong> tab above.
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
                showStaple={catalogBacked && CATALOG_SKU_RE.test(product.id)}
                isStaple={stapleBySku.has(product.id)}
                onStapleClick={() => openStapleDialog(product)}
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
                showStaple={catalogBacked && CATALOG_SKU_RE.test(product.id)}
                isStaple={stapleBySku.has(product.id)}
                onStapleClick={() => openStapleDialog(product)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">No products found</p>
            )}
          </div>
        </>
      )}

      <Dialog
        open={stapleDialogProduct != null}
        onOpenChange={(open) => {
          if (!open) setStapleDialogProduct(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Recurring staple</DialogTitle>
            <DialogDescription className="text-base font-medium text-foreground">
              {stapleDialogProduct?.name ?? ""}
            </DialogDescription>
          </DialogHeader>
          {stapleDialogProduct && (
            <div className="space-y-4 pt-1">
              <div className="flex justify-center gap-2 sm:gap-8">
                <div className="flex flex-col items-center">
                  <span className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Days apart
                  </span>
                  <AlarmStyleWheel
                    key={`int-${stapleWheelReset}`}
                    options={STAPLE_INTERVAL_OPTIONS}
                    value={stapleInterval}
                    onChange={setStapleInterval}
                    ariaLabel="Days between orders"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <span className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    Quantity
                  </span>
                  <AlarmStyleWheel
                    key={`qty-${stapleWheelReset}`}
                    options={STAPLE_QTY_OPTIONS}
                    value={stapleQty}
                    onChange={setStapleQty}
                    ariaLabel="Quantity per order"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {stapleBySku.has(stapleDialogProduct.id) && (
                  <button
                    type="button"
                    onClick={() => removeStaple.mutate(stapleDialogProduct.id)}
                    disabled={removeStaple.isPending}
                    className="rounded-full border border-destructive/50 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Remove staple
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!stapleDialogProduct) return;
                    saveStaple.mutate({
                      sku: stapleDialogProduct.id,
                      interval_days: stapleInterval,
                      default_quantity: stapleQty,
                    });
                  }}
                  disabled={saveStaple.isPending}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                    <div className="flex items-center gap-1.5 mt-0.5 min-h-[1.25rem]">
                      <DietStickers dietTags={r.diet_tags} />
                    </div>
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
                {selectedRecipe && hasVisibleDietStickers(selectedRecipe.diet_tags) && (
                  <div className="mt-2">
                    <DietStickers dietTags={selectedRecipe.diet_tags} size="md" />
                  </div>
                )}
                <DialogDescription className="text-xs mt-2">
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
