import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import WeeklySummary from "@/components/WeeklySummary";
import TopBar from "@/components/TopBar";
import Toolbar from "@/components/Toolbar";
import AIPanel from "@/components/AIPanel";
import WeekGroceriesSection from "@/components/WeekGroceriesSection";
import AiSuggestionsSection from "@/components/AiSuggestionsSection";
import DayExtrasDialog from "@/components/DayExtrasDialog";
import PlannerGrid from "@/components/PlannerGrid";
import CheckoutSidebar from "@/components/CheckoutSidebar";
import { BasketIngredient } from "@/components/CheckoutSidebar";
import FooterBar from "@/components/FooterBar";
import DeliverySlotPicker from "@/components/DeliverySlotPicker";
import RecipeDetail from "@/components/RecipeDetail";
import FestiveBanner from "@/components/FestiveBanner";
import ChatBox from "@/components/ChatBox";
import ItemsPage from "@/components/ItemsPage";
import HistoryPage from "@/components/HistoryPage";
import FavouritesPage from "@/components/FavouritesPage";
import CheckoutPage from "@/components/CheckoutPage";
import EasterPage from "@/components/EasterPage";
import ProfilePage from "@/components/ProfilePage";
import {
  mealPlanOptions,
  getRecipeForMeal,
  DayPlan,
  Meal,
  Product,
  type DayExtraLine,
} from "@/data/meals";
import {
  createOrder,
  fetchDeliveries,
  fetchRecurringEligible,
  fetchRecipes,
  matchDishes,
  PICNIC_DEMO_CUSTOMER_ID,
  shoppingFromMeals,
  speakText,
  imageUrlFromShoppingDetailRow,
} from "@/lib/api";
import { weekPlanFromRecipes } from "@/lib/plannerFromRecipes";
import { mergeMealAndExtraForDisplay, mergeLinesBySku } from "@/lib/mergeBasket";
import { loadHouseholdProfile, HOUSEHOLD_PROFILE_SAVED_EVENT } from "@/lib/profileStorage";
import { filterRecipesForPlanner } from "@/lib/recipeDietary";
import { recipesForMealCategory } from "@/lib/recipeMealTimes";
import {
  applySpicyPoolRules,
  loadSpicyLearning,
  mealHasSpicyTag,
  recordSpicyReject,
  resetSpicyAvoid,
  SPICY_LEARNING_EVENT,
} from "@/lib/spicyLearning";
import { toast } from "@/components/ui/sonner";

const GROCERIES_LABEL = "Groceries";

/** Matches article `sku` values from SQLite (e.g. `VEG-TOM-001`). Excludes mock IDs like `rec-milk`. */
const CATALOG_SKU_RE = /^[A-Z0-9]+-[A-Z0-9]+-\d{3}$/;

type RecurringLine = {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  frequency: string;
  added: boolean;
  quantity: number;
};

const Index = () => {
  const queryClient = useQueryClient();
  const [activeNav, setActiveNav] = useState("planner");
  const [activeMealFilters, setActiveMealFilters] = useState<string[]>([
    "breakfast",
    "lunch",
    "dinner",
    "extras",
  ]);
  const [extrasDialogMealId, setExtrasDialogMealId] = useState<string | null>(null);
  const [activePlanIndex] = useState(0);
  const [mealPlans, setMealPlans] = useState<DayPlan[][]>(() =>
    mealPlanOptions.map((o) => o.plans.map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m })) })))
  );
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [selectedMealData, setSelectedMealData] = useState<Meal | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [deliverySlot, setDeliverySlot] = useState("Mon 14.04 18:00-19:00");
  const [aiOpen, setAiOpen] = useState(false);
  const [mealPlanBasket, setMealPlanBasket] = useState<BasketIngredient[]>([]);
  const [extraGroceries, setExtraGroceries] = useState<BasketIngredient[]>([]);
  const mealPlanBasketRef = useRef<BasketIngredient[]>([]);
  mealPlanBasketRef.current = mealPlanBasket;

  const [favourites, setFavourites] = useState<{ id: string; name: string; brand: string; price: number; image: string }[]>([]);
  const [checkoutPageOpen, setCheckoutPageOpen] = useState(false);
  const [easterPageOpen, setEasterPageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [aiMatches, setAiMatches] = useState<
    { id: string; name: string; reason?: string; estimated_price?: number }[]
  >([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCatalogEmpty, setAiCatalogEmpty] = useState(false);
  const spokenAudioRef = useRef<HTMLAudioElement | null>(null);

  /** Bumps when household profile is saved so the API-backed week plan refilters by diet. */
  const [plannerDietKey, setPlannerDietKey] = useState(0);
  /** Bumps when spicy learning crosses threshold or user resets — replan ordering / filters. */
  const [spicyLearningKey, setSpicyLearningKey] = useState(0);

  const [recurring, setRecurring] = useState<RecurringLine[]>([]);
  const recurringFpRef = useRef("");

  const mealPlan = mealPlans[activePlanIndex];

  /** Slot id + recipe id only (ignores price) — refetch ingredient totals when assignments change, not on every price write. */
  const slotPriceKey = useMemo(
    () =>
      mealPlan
        .flatMap((d) => d.meals)
        .filter((m) => m.recipeId)
        .map((m) => `${m.id}\t${m.recipeId}`)
        .join("|"),
    [mealPlan]
  );

  const slotExtrasBasket = useMemo(() => {
    const lines: BasketIngredient[] = [];
    for (const day of mealPlan) {
      const slot = day.meals.find((m) => m.category === "extras");
      // Do not require `selected`: extras count even when the card is dimmed; saved lines should still count.
      if (!slot?.extrasLines?.length) continue;
      const label = `${day.day} · Extras`;
      for (const row of slot.extrasLines) {
        lines.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          price: row.price,
          weight: row.weight,
          image: row.image,
          quantity: row.quantity,
          fromMeal: label,
        });
      }
    }
    return mergeLinesBySku(lines);
  }, [mealPlan]);

  const catalogExtrasMerged = useMemo(
    () => mergeLinesBySku([...slotExtrasBasket, ...extraGroceries]),
    [slotExtrasBasket, extraGroceries]
  );

  const displayBasket = useMemo(
    () => mergeMealAndExtraForDisplay(mealPlanBasket, catalogExtrasMerged),
    [mealPlanBasket, catalogExtrasMerged]
  );

  const extrasDialogMeal = extrasDialogMealId
    ? mealPlan.flatMap((d) => d.meals).find((m) => m.id === extrasDialogMealId) ?? null
    : null;
  const extrasDialogDay =
    extrasDialogMealId && extrasDialogMeal
      ? mealPlan.find((d) => d.meals.some((m) => m.id === extrasDialogMealId))?.day ?? ""
      : "";

  const { data: catalogRecipes } = useQuery({
    // Bump when recipe tags / API shape change so clients don’t keep stale `diet_tags` (e.g. spicy).
    queryKey: ["planner-recipes", "diet-tags-v12"],
    queryFn: fetchRecipes,
    staleTime: 60_000,
  });

  const recipeDietTagsById = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of catalogRecipes ?? []) {
      if (r.diet_tags?.length) m[r.id] = r.diet_tags;
    }
    return m;
  }, [catalogRecipes]);

  /** Filter AI matches by profile flavor (spicy / not spicy) and learned spicy avoidance. */
  const filteredAiMatches = useMemo(() => {
    const profile = loadHouseholdProfile();
    const codes = profile.selectedDiets;
    const tags = recipeDietTagsById;
    let list = aiMatches;
    if (codes.includes("spicy")) {
      list = list.filter((m) => tags[m.id]?.includes("spicy"));
    } else if (codes.includes("not_spicy") || loadSpicyLearning().avoidSpicy) {
      list = list.filter((m) => !tags[m.id]?.includes("spicy"));
    }
    return list;
  }, [aiMatches, recipeDietTagsById, spicyLearningKey, plannerDietKey]);

  const spicyLearnState = useMemo(() => loadSpicyLearning(), [spicyLearningKey]);
  const spicyHiddenFromPlanner = spicyLearnState.avoidSpicy;

  const { data: recurringPayload } = useQuery({
    queryKey: ["recurring-eligible", PICNIC_DEMO_CUSTOMER_ID],
    queryFn: () => fetchRecurringEligible(PICNIC_DEMO_CUSTOMER_ID),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!recurringPayload?.items) return;
    const fp = recurringPayload.items
      .map((i) => `${i.sku}:${i.interval_days}:${i.last_ordered_at ?? ""}`)
      .join("|");
    if (fp === recurringFpRef.current) return;
    recurringFpRef.current = fp;
    setRecurring(
      recurringPayload.items.map((row) => ({
        id: row.sku,
        name: row.name,
        brand: row.category || "Catalog",
        price: row.price,
        weight: `${row.suggested_quantity}×`,
        image:
          row.image_url && (row.image_url.startsWith("/") || row.image_url.startsWith("http"))
            ? row.image_url
            : "🛒",
        frequency:
          row.source === "manual"
            ? `Every ${row.interval_days} d · My staple`
            : `Every ${row.interval_days} d · Auto (≥1 order)`,
        added: false,
        quantity: row.suggested_quantity,
      }))
    );
  }, [recurringPayload]);

  useEffect(() => {
    const onProfileSaved = () => setPlannerDietKey((k) => k + 1);
    window.addEventListener(HOUSEHOLD_PROFILE_SAVED_EVENT, onProfileSaved);
    return () => window.removeEventListener(HOUSEHOLD_PROFILE_SAVED_EVENT, onProfileSaved);
  }, []);

  useEffect(() => {
    const onSpicyLearning = () => setSpicyLearningKey((k) => k + 1);
    window.addEventListener(SPICY_LEARNING_EVENT, onSpicyLearning);
    return () => window.removeEventListener(SPICY_LEARNING_EVENT, onSpicyLearning);
  }, []);

  useEffect(() => {
    if (!catalogRecipes?.length) return;
    const profile = loadHouseholdProfile();
    const avoidSpicyLearned = loadSpicyLearning().avoidSpicy;
    const wantsSpicyOnly = profile.selectedDiets.includes("spicy");
    const stripLearnedSpicy = avoidSpicyLearned && !wantsSpicyOnly;

    let pool = filterRecipesForPlanner(catalogRecipes, profile.selectedDiets);
    if (pool.length === 0) {
      toast.info("No recipes match every selected dietary need — showing the full catalog.");
      pool = catalogRecipes;
    }

    let poolSpicy = applySpicyPoolRules(pool, stripLearnedSpicy);
    if (poolSpicy.length === 0 && stripLearnedSpicy) {
      toast.info("No recipes match your diet without spicy dishes — showing a wider set.");
      poolSpicy = pool;
    }
    const plan = weekPlanFromRecipes(poolSpicy);
    setMealPlans((prev) => {
      const previousWeek = prev[0];
      if (!previousWeek?.length) return [plan];
      const merged = plan.map((newDay) => {
        const oldDay = previousWeek.find((d) => d.day === newDay.day);
        const oldExtras = oldDay?.meals.find((m) => m.category === "extras");
        const lines = oldExtras?.extrasLines;
        if (!lines?.length) return newDay;
        return {
          ...newDay,
          meals: newDay.meals.map((m) => {
            if (m.category !== "extras") return m;
            const n = lines.reduce((s, l) => s + l.quantity, 0);
            const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
            return {
              ...m,
              extrasLines: lines.map((l) => ({ ...l })),
              selected: n > 0 ? true : m.selected,
              price: Math.round(total * 100) / 100,
              weight: n > 0 ? `${n} items` : m.weight,
              name: n > 0 ? `Groceries (${n})` : m.name,
            };
          }),
        };
      });
      return [merged];
    });
  }, [catalogRecipes, plannerDietKey, spicyLearningKey]);

  /** Ingredient totals per slot — runs when slot↔recipe assignments change (not when only `price` changes). */
  useEffect(() => {
    if (!slotPriceKey) return;
    const slots = mealPlan
      .flatMap((d) => d.meals)
      .filter((m): m is Meal & { recipeId: string } => Boolean(m.recipeId));
    if (!slots.length) return;

    let cancelled = false;
    shoppingFromMeals(slots.map((m) => ({ recipe_id: m.recipeId, label: m.id })))
      .then((res) => {
        if (cancelled) return;
        const totals = new Map<string, number>();
        const imageBySlot = new Map<string, string>();
        for (const row of res.detail) {
          const key = String(row.meal_label ?? "").trim();
          if (!key) continue;
          totals.set(key, (totals.get(key) ?? 0) + row.line_total);
          if (!imageBySlot.has(key)) {
            imageBySlot.set(key, imageUrlFromShoppingDetailRow(row));
          }
        }
        setMealPlans((prev) =>
          prev.map((week) =>
            week.map((day) => ({
              ...day,
              meals: day.meals.map((m) => {
                if (!m.recipeId) return m;
                const t = totals.get(m.id);
                const img = imageBySlot.get(m.id);
                if (t === undefined && img === undefined) return m;
                return {
                  ...m,
                  ...(t !== undefined ? { price: Math.round(t * 100) / 100 } : {}),
                  ...(img !== undefined && m.category !== "extras" ? { image: img } : {}),
                };
              }),
            }))
          )
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // mealPlan intentionally omitted: only refetch when slot↔recipe identity changes (slotPriceKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotPriceKey]);

  const { data: apiRecipePreview, isLoading: apiRecipeLoading } = useQuery({
    queryKey: ["recipe-preview", selectedMealData?.recipeId],
    queryFn: () =>
      shoppingFromMeals([
        {
          recipe_id: selectedMealData!.recipeId!,
          label: selectedRecipe ?? selectedMealData!.id,
        },
      ]),
    enabled: Boolean(selectedMealData?.recipeId && selectedRecipe),
  });

  useEffect(() => {
    const selectedMeals = mealPlan.flatMap((d) => d.meals).filter((m) => m.selected);
    const recipeMeals = selectedMeals.filter((m): m is Meal & { recipeId: string } => Boolean(m.recipeId));

    if (selectedMeals.length === 0 || recipeMeals.length === 0) {
      setMealPlanBasket([]);
      return;
    }

    const allHaveRecipe = recipeMeals.every((m) => m.recipeId);

    if (!allHaveRecipe) {
      const ingredientsFromMeals: BasketIngredient[] = [];
      for (const meal of recipeMeals) {
        const recipe = getRecipeForMeal(meal);
        for (const ing of recipe.ingredients) {
          const existing = ingredientsFromMeals.find((i) => i.id === ing.id);
          if (existing) {
            existing.quantity += ing.quantity;
          } else {
            ingredientsFromMeals.push({
              id: ing.id,
              name: ing.name,
              brand: ing.brand,
              price: ing.price,
              weight: ing.weight,
              image: ing.image,
              quantity: ing.quantity,
              fromMeal: meal.id,
            });
          }
        }
      }
      setMealPlanBasket(ingredientsFromMeals);
      return;
    }

    let cancelled = false;
    const slotNameById = new Map(recipeMeals.map((m) => [m.id, m.name] as const));
    shoppingFromMeals(
      recipeMeals.map((m) => ({
        recipe_id: m.recipeId as string,
        label: m.id,
      }))
    )
      .then((res) => {
        if (cancelled) return;
        const metaBySku = new Map<
          string,
          { article_name: string; ingredient_name: string; meal_label: string; image: string }
        >();
        for (const row of res.detail) {
          if (!metaBySku.has(row.sku)) {
            metaBySku.set(row.sku, {
              article_name: row.article_name,
              ingredient_name: row.ingredient_name,
              meal_label: row.meal_label,
              image: imageUrlFromShoppingDetailRow(row),
            });
          }
        }
        const merged: BasketIngredient[] = [];
        for (const line of res.checkout_lines) {
          const meta = metaBySku.get(line.sku);
          if (!meta) continue;
          const fromSlot = String(meta.meal_label ?? "").trim();
          merged.push({
            id: line.sku,
            name: line.name,
            brand: meta.ingredient_name,
            price: line.unit_price,
            weight: `${line.quantity}×`,
            image: meta.image,
            quantity: line.quantity,
            fromMeal: slotNameById.get(fromSlot) ?? fromSlot,
          });
        }
        setMealPlanBasket(merged);
      })
      .catch(() => {
        if (cancelled) return;
        const ingredientsFromMeals: BasketIngredient[] = [];
        for (const meal of recipeMeals) {
          const recipe = getRecipeForMeal(meal);
          for (const ing of recipe.ingredients) {
            const existing = ingredientsFromMeals.find((i) => i.id === ing.id);
            if (existing) {
              existing.quantity += ing.quantity;
            } else {
              ingredientsFromMeals.push({
                id: ing.id,
                name: ing.name,
                brand: ing.brand,
                price: ing.price,
                weight: ing.weight,
                image: ing.image,
                quantity: ing.quantity,
                fromMeal: meal.id,
              });
            }
          }
        }
        setMealPlanBasket(ingredientsFromMeals);
      });

    return () => {
      cancelled = true;
    };
  }, [mealPlan]);

  const toggleMealFilter = (cat: string) => {
    setActiveMealFilters((prev) => {
      if (prev.includes(cat)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== cat);
      }
      return [...prev, cat];
    });
  };

  const handleClickMeal = (id: string) => {
    const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === id);
    if (!meal) return;
    if (meal.category === "extras") {
      setExtrasDialogMealId(id);
      return;
    }
    if (!meal.recipeId && meal.name === "Add a recipe") {
      toast.info("Drag a recipe from suggestions onto this slot, or use Swap.");
      return;
    }
    setSelectedMealData(meal);
    setSelectedRecipe(id);
  };

  const handleApplyDayExtras = useCallback((mealId: string, lines: DayExtraLine[]) => {
    setMealPlans((prev) =>
      prev.map((plan, pi) =>
        pi === activePlanIndex
          ? plan.map((day) => ({
              ...day,
              meals: day.meals.map((m) => {
                if (m.id !== mealId) return m;
                const n = lines.reduce((s, l) => s + l.quantity, 0);
                const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
                return {
                  ...m,
                  extrasLines: lines,
                  selected: n > 0 ? true : m.selected,
                  price: Math.round(total * 100) / 100,
                  weight: n > 0 ? `${n} items` : "Add items",
                  name: n > 0 ? `Groceries (${n})` : "Day extras",
                };
              }),
            }))
          : plan
      )
    );
  }, [activePlanIndex]);

  const removeMealFromSlot = useCallback(
    (id: string) => {
      const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === id);
      if (!meal) return;
      if (meal.category === "extras") {
        handleApplyDayExtras(id, []);
        return;
      }
      if (!meal.recipeId && meal.name === "Add a recipe") return;
      if (mealHasSpicyTag(meal.dietTags)) {
        const crossed = recordSpicyReject();
        if (crossed) {
          toast.info("We’ll stop suggesting spicy dishes. You can turn this back on in Profile.");
        }
      }
      setMealPlans((prev) =>
        prev.map((plan, pi) =>
          pi === activePlanIndex
            ? plan.map((day) => ({
                ...day,
                meals: day.meals.map((m) =>
                  m.id === id
                    ? {
                        ...m,
                        name: "Add a recipe",
                        brand: "",
                        price: 0,
                        weight: "Drag or swap",
                        image: "➕",
                        recipeId: undefined,
                        dietTags: undefined,
                        selected: false,
                      }
                    : m
                ),
              }))
            : plan
        )
      );
    },
    [activePlanIndex, mealPlan, handleApplyDayExtras]
  );

  const filteredPlan = useMemo(
    () =>
      mealPlan.map((day) => ({
        ...day,
        meals:
          activeMealFilters.length > 0 ? day.meals.filter((m) => activeMealFilters.includes(m.category)) : day.meals,
      })),
    [mealPlan, activeMealFilters]
  );

  const mergeExtraLine = useCallback((prev: BasketIngredient[], line: BasketIngredient): BasketIngredient[] => {
    const existing = prev.find((i) => i.id === line.id);
    if (!existing) return [...prev, { ...line, fromMeal: line.fromMeal ?? GROCERIES_LABEL }];
    return prev.map((i) =>
      i.id === line.id ? { ...i, quantity: i.quantity + line.quantity, price: line.price || i.price } : i
    );
  }, []);

  const handleAddToBasket = useCallback(
    (
      ingredients: {
        id: string;
        name: string;
        brand: string;
        price: number;
        weight: string;
        image: string;
        quantity: number;
      }[]
    ) => {
      setExtraGroceries((prev) => {
        let next = prev;
        for (const ing of ingredients) {
          const line: BasketIngredient = {
            ...ing,
            fromMeal: GROCERIES_LABEL,
          };
          next = mergeExtraLine(next, line);
        }
        return next;
      });
    },
    [mergeExtraLine]
  );

  const handleUpdateIngredientQty = useCallback((id: string, delta: number) => {
    const mealQty = mealPlanBasketRef.current.filter((m) => m.id === id).reduce((s, m) => s + m.quantity, 0);
    setExtraGroceries((prev) => {
      const ex = prev.find((e) => e.id === id);
      const extraQty = ex?.quantity ?? 0;
      const display = mealQty + extraQty;
      const newDisplay = Math.max(mealQty, display + delta);
      const newExtra = newDisplay - mealQty;
      if (newExtra <= 0) return prev.filter((e) => e.id !== id);
      const template = ex ?? mealPlanBasketRef.current.find((m) => m.id === id);
      if (!template) return prev;
      const updated: BasketIngredient = {
        ...template,
        quantity: newExtra,
        fromMeal: GROCERIES_LABEL,
      };
      if (ex) return prev.map((e) => (e.id === id ? updated : e));
      return [...prev, updated];
    });
  }, []);

  const handleRemoveIngredient = useCallback((id: string) => {
    setExtraGroceries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const toggleFavourite = useCallback(
    (id: string) => {
      setFavourites((prev) => {
        if (prev.find((f) => f.id === id)) return prev.filter((f) => f.id !== id);
        const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === id);
        if (meal) return [...prev, { id: meal.id, name: meal.name, brand: meal.brand, price: meal.price, image: meal.image }];
        return prev;
      });
    },
    [mealPlan]
  );

  const handleAddProductToBasket = useCallback(
    (product: Product) => {
      setExtraGroceries((prev) =>
        mergeExtraLine(prev, {
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: product.price,
          weight: product.weight,
          image: product.image,
          quantity: 1,
        })
      );
    },
    [mergeExtraLine]
  );

  const handleRemoveOneProductFromBasket = useCallback((productId: string) => {
    setExtraGroceries((prev) => {
      const ex = prev.find((e) => e.id === productId);
      if (!ex) return prev;
      if (ex.quantity <= 1) return prev.filter((e) => e.id !== productId);
      return prev.map((e) => (e.id === productId ? { ...e, quantity: e.quantity - 1 } : e));
    });
    // If there was no extra line but user clicked minus (shouldn't happen for qty badge), no-op
  }, []);

  const basketQuantityById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of extraGroceries) {
      m[i.id] = (m[i.id] ?? 0) + i.quantity;
    }
    return m;
  }, [extraGroceries]);

  const ingredientsTotal = displayBasket.reduce((s, i) => s + i.price * i.quantity, 0);
  const recurringTotal = recurring.filter((r) => r.added).reduce((s, r) => s + r.price * r.quantity, 0);
  const grandTotal = ingredientsTotal + recurringTotal;

  const handlePlaceOrder = useCallback(async () => {
    const qtyBySku = new Map<string, number>();
    const addLine = (id: string, q: number) => {
      if (!CATALOG_SKU_RE.test(id)) return;
      qtyBySku.set(id, (qtyBySku.get(id) ?? 0) + q);
    };
    for (const i of displayBasket) addLine(i.id, i.quantity);
    for (const r of recurring) {
      if (r.added) addLine(r.id, r.quantity);
    }
    const lines = Array.from(qtyBySku, ([sku, quantity]) => ({ sku, quantity }));
    if (!lines.length) {
      toast.error(
        "No catalog items to order. Add groceries from the planner or Items tab."
      );
      return;
    }

    let deliveryId: string;
    try {
      const deliveries = await fetchDeliveries();
      deliveryId = deliveries[0]?.id ?? "";
    } catch {
      toast.error("Could not load deliveries. Is the API running on port 8000?");
      return;
    }
    if (!deliveryId) {
      toast.error("No delivery slots in the database.");
      return;
    }

    const recipeIds = [
      ...new Set(
        mealPlan
          .flatMap((d) => d.meals)
          .filter((m) => m.selected && m.recipeId)
          .map((m) => m.recipeId as string)
      ),
    ];

    try {
      const result = await createOrder({
        customer_id: PICNIC_DEMO_CUSTOMER_ID,
        delivery_id: deliveryId,
        status: "paid",
        creation_date: new Date().toISOString().slice(0, 10),
        lines,
        recipe_ids: recipeIds,
      });
      toast.success(
        `Order ${result.order_id.slice(0, 8)}… placed — ${result.total_price.toFixed(2).replace(".", ",")} € (catalog lines)`
      );
      setMealPlanBasket([]);
      setExtraGroceries([]);
      setCheckoutPageOpen(false);
      queryClient.invalidateQueries({ queryKey: ["recurring-eligible", PICNIC_DEMO_CUSTOMER_ID] });
      queryClient.invalidateQueries({ queryKey: ["recurring-manual", PICNIC_DEMO_CUSTOMER_ID] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.length > 180 ? `${msg.slice(0, 180)}…` : msg);
    }
  }, [displayBasket, recurring, mealPlan, queryClient]);

  const handleAiPrompt = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setAiLoading(true);
    setAiError(null);
    setAiCatalogEmpty(false);
    setAiMatches([]);

    let matches: { id: string; name: string; reason?: string; estimated_price?: number }[] = [];
    try {
      const res = await matchDishes(q);
      matches = res.matches ?? [];
      setAiMatches(matches);
      setAiCatalogEmpty(matches.length === 0);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setAiMatches([]);
      setAiCatalogEmpty(false);
      setAiError(
        err.includes("503") || err.toLowerCase().includes("openai")
          ? "AI matching unavailable — add `openai.env` with OPENAI_KEY or OPENAI_API_KEY, or check API logs."
          : `Could not reach match-dishes: ${err.slice(0, 200)}`
      );
      setAiLoading(false);
      return;
    }

    try {
      const spokenText =
        matches.length > 0
          ? `I found ${matches.length} recipe ${matches.length === 1 ? "match" : "matches"}. ${matches
              .slice(0, 3)
              .map((match, index) => `${index + 1}. ${match.name}. ${match.reason ?? ""}`)
              .join(" ")}`
          : "I could not find any strong matches in the catalog. Try different wording or a different cuisine.";

      const audioBlob = await speakText(spokenText);
      const audioUrl = URL.createObjectURL(audioBlob);
      if (spokenAudioRef.current) {
        spokenAudioRef.current.pause();
        spokenAudioRef.current.src = "";
      }
      const audio = new Audio(audioUrl);
      spokenAudioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => URL.revokeObjectURL(audioUrl);
      await audio.play().catch(() => URL.revokeObjectURL(audioUrl));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn("Voice playback failed", err);
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (spokenAudioRef.current) {
        spokenAudioRef.current.pause();
        spokenAudioRef.current.src = "";
      }
    };
  }, []);

  const handleSwapMeal = useCallback(
    (oldId: string, newMeal: Meal) => {
      setMealPlans((prev) =>
        prev.map((plan, pi) =>
          pi === activePlanIndex
            ? plan.map((day) => ({
                ...day,
                meals: day.meals.map((m) => (m.id === oldId ? { ...newMeal, selected: true } : m)),
              }))
            : plan
        )
      );
      setSwapMealId(null);
    },
    [activePlanIndex]
  );

  const handleDropAiRecipeOnSlot = useCallback(
    (mealId: string, recipe: { id: string; name: string; price: number }) => {
      const oldMeal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === mealId);
      const newTags = recipeDietTagsById[recipe.id];
      if (mealHasSpicyTag(oldMeal?.dietTags) && !mealHasSpicyTag(newTags)) {
        const crossed = recordSpicyReject();
        if (crossed) {
          toast.info("We’ll stop suggesting spicy dishes. You can turn this back on in Profile.");
        }
      }
      const mealPrice = Number.isFinite(recipe.price) ? Math.round(recipe.price * 100) / 100 : 0;
      setMealPlans((prev) =>
        prev.map((plan, pi) =>
          pi === activePlanIndex
            ? plan.map((day) => ({
                ...day,
                meals: day.meals.map((m) => {
                  if (m.id !== mealId || m.category === "extras") return m;
                  return {
                    ...m,
                    recipeId: recipe.id,
                    name: recipe.name,
                    brand: "Picnic",
                    price: mealPrice,
                    weight: "1 serving",
                    image: "🍽️",
                    selected: true,
                    dietTags: recipeDietTagsById[recipe.id] ? [...recipeDietTagsById[recipe.id]] : undefined,
                  };
                }),
              }))
            : plan
        )
      );
      toast.success(`Replaced with “${recipe.name}”`);
      shoppingFromMeals([{ recipe_id: recipe.id, label: mealId }])
        .then((res) => {
          const row = res.detail[0];
          if (!row) return;
          const img = imageUrlFromShoppingDetailRow(row);
          setMealPlans((prev) =>
            prev.map((plan, pi) =>
              pi === activePlanIndex
                ? plan.map((day) => ({
                    ...day,
                    meals: day.meals.map((m) => (m.id === mealId ? { ...m, image: img } : m)),
                  }))
                : plan
            )
          );
        })
        .catch(() => {});
    },
    [activePlanIndex, recipeDietTagsById, mealPlan]
  );

  const autoSwapMeal = useCallback(
    (mealId: string) => {
      const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === mealId);
      if (!meal || meal.category === "extras") return;
      if (!catalogRecipes?.length) {
        toast.error("Catalog not loaded yet.");
        return;
      }
      const profile = loadHouseholdProfile();
      let pool = filterRecipesForPlanner(catalogRecipes, profile.selectedDiets);
      if (pool.length === 0) pool = [...catalogRecipes];
      const avoidSpicyLearned = loadSpicyLearning().avoidSpicy;
      const wantsSpicyOnly = profile.selectedDiets.includes("spicy");
      const stripLearnedSpicy = avoidSpicyLearned && !wantsSpicyOnly;
      pool = applySpicyPoolRules(pool, stripLearnedSpicy);
      if (pool.length === 0) pool = [...catalogRecipes];
      pool = recipesForMealCategory(pool, meal.category);
      const currentId = meal.recipeId;
      pool = pool.filter((r) => r.id !== currentId);
      if (pool.length === 0) {
        toast.info("No other recipe fits your preferences right now.");
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      handleDropAiRecipeOnSlot(mealId, { id: pick.id, name: pick.name, price: 0 });
    },
    [catalogRecipes, mealPlan, handleDropAiRecipeOnSlot]
  );

  if (profileOpen) {
    return (
      <ProfilePage
        customerId={PICNIC_DEMO_CUSTOMER_ID}
        onBack={() => setProfileOpen(false)}
      />
    );
  }

  if (easterPageOpen) {
    return (
      <EasterPage onBack={() => setEasterPageOpen(false)} onAddToBasket={handleAddProductToBasket} />
    );
  }

  if (checkoutPageOpen) {
    return (
      <CheckoutPage
        onBack={() => setCheckoutPageOpen(false)}
        deliverySlot={deliverySlot}
        onSelectSlot={setDeliverySlot}
        basketIngredients={displayBasket}
        recurringItems={recurring}
        onPlaceOrder={handlePlaceOrder}
      />
    );
  }

  if (selectedRecipe && selectedMealData) {
    if (selectedMealData.recipeId) {
      if (apiRecipeLoading) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <p className="text-muted-foreground">Loading ingredients…</p>
          </div>
        );
      }
      if (apiRecipePreview?.detail?.length) {
        const ingredients = apiRecipePreview.detail.map((row, i) => ({
          id: `${row.sku}-${row.ingredient_name}-${i}`,
          catalogSku: row.sku,
          name: row.article_name,
          brand: row.ingredient_name,
          price: row.unit_price,
          weight: String(row.quantity),
          needed: row.ingredient_name,
          quantity: row.quantity,
          image: imageUrlFromShoppingDetailRow(row),
          alternatives: [] as { name: string; brand: string; price: number; image: string }[],
        }));
        return (
          <RecipeDetail
            title={selectedMealData.name}
            subtitle="From your Picnic catalog"
            heroEmoji={selectedMealData.image}
            prepTime="—"
            preparation={["Ingredients from recipe → article mapping in your SQLite database."]}
            ingredients={ingredients}
            dietTags={selectedMealData.dietTags}
            onBack={() => {
              setSelectedRecipe(null);
              setSelectedMealData(null);
            }}
            onAddToBasket={handleAddToBasket}
            onToggleFavourite={toggleFavourite}
            isFavourite={!!favourites.find((f) => f.id === selectedRecipe)}
            mealId={selectedRecipe}
          />
        );
      }
    }

    const recipe = getRecipeForMeal(selectedMealData);
    return (
      <RecipeDetail
        title={recipe.title}
        subtitle={recipe.subtitle}
        heroEmoji={recipe.heroEmoji}
        prepTime={recipe.prepTime}
        preparation={recipe.preparation}
        ingredients={recipe.ingredients}
        dietTags={selectedMealData.dietTags}
        onBack={() => {
          setSelectedRecipe(null);
          setSelectedMealData(null);
        }}
        onAddToBasket={handleAddToBasket}
        onToggleFavourite={toggleFavourite}
        isFavourite={!!favourites.find((f) => f.id === selectedRecipe)}
        mealId={selectedRecipe}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar activeNav={activeNav} onNavChange={setActiveNav} onProfileClick={() => setProfileOpen(true)} />
      <FestiveBanner onExplore={() => setEasterPageOpen(true)} />

      {activeNav === "planner" && (
        <>
          <Toolbar onToggleAI={() => setAiOpen((p) => !p)} aiOpen={aiOpen} />
          <AIPanel isOpen={aiOpen} loading={aiLoading} onSubmitPrompt={handleAiPrompt} />
          <WeeklySummary mealPlan={mealPlan} />
          {spicyHiddenFromPlanner && (
            <div className="max-w-6xl mx-auto w-full px-4 mb-3 rounded-xl border border-amber-200/60 bg-amber-50/80 dark:bg-amber-950/25 dark:border-amber-800/50 px-3 py-2.5 text-xs text-foreground leading-snug">
              <span className="font-medium">Spicy meals are hidden from this week</span> after several swaps or
              deselects. The planner won’t show the 🔥 tag until you allow spicy again, or browse the full list below.
              <button
                type="button"
                className="ml-1.5 font-semibold text-primary hover:underline"
                onClick={() => {
                  resetSpicyAvoid();
                  toast.success("Spicy recipes are back in your plan.");
                }}
              >
                Show spicy in planner
              </button>
            </div>
          )}
          <AiSuggestionsSection
            aiMatches={filteredAiMatches}
            sourceMatchCount={aiMatches.length}
            aiLoading={aiLoading}
            aiError={aiError}
            aiCatalogEmpty={aiCatalogEmpty}
            dietTagsByRecipeId={recipeDietTagsById}
          />
          <div className="px-4 pt-2 max-w-app mx-auto w-full">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Per-weekday</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 max-w-app mx-auto w-full">
            <span className="text-lg font-bold text-foreground">Week of 7 Apr 2026</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveNav("items")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Browse all groceries
              </button>
              <p className="text-sm text-muted-foreground">Click a meal for recipe & ingredients</p>
            </div>
          </div>
          <div className="flex-1 px-4 max-w-app mx-auto w-full pb-4">
            <PlannerGrid
              filteredPlan={filteredPlan}
              activeMealFilters={activeMealFilters}
              onRemoveMeal={removeMealFromSlot}
              onClickMeal={handleClickMeal}
              onRemoveColumn={toggleMealFilter}
              onToggleFavourite={toggleFavourite}
              favouriteIds={favourites.map((f) => f.id)}
              onSwapMeal={autoSwapMeal}
              onDropAiRecipe={handleDropAiRecipeOnSlot}
            />
          </div>
          <WeekGroceriesSection basketIngredients={displayBasket} ingredientsTotal={ingredientsTotal} />
          <DayExtrasDialog
            open={extrasDialogMealId != null}
            onOpenChange={(o) => {
              if (!o) setExtrasDialogMealId(null);
            }}
            dayLabel={extrasDialogDay}
            meal={extrasDialogMeal}
            onApply={(lines) => {
              if (extrasDialogMealId) handleApplyDayExtras(extrasDialogMealId, lines);
            }}
          />
        </>
      )}

      {activeNav === "items" && (
        <ItemsPage
          customerId={PICNIC_DEMO_CUSTOMER_ID}
          onAddToBasket={handleAddProductToBasket}
          onRemoveOneFromBasket={handleRemoveOneProductFromBasket}
          basketQuantityById={basketQuantityById}
        />
      )}
      {activeNav === "history" && <HistoryPage />}
      {activeNav === "favourites" && <FavouritesPage favourites={favourites} onRemove={(id) => toggleFavourite(id)} />}

      <ChatBox floating />

      <CheckoutSidebar
        isOpen={checkoutOpen}
        onToggle={() => setCheckoutOpen((p) => !p)}
        mealPlan={mealPlan}
        deliverySlot={deliverySlot}
        onOpenSlotPicker={() => setSlotPickerOpen(true)}
        basketIngredients={displayBasket}
        onUpdateIngredientQty={handleUpdateIngredientQty}
        onRemoveIngredient={handleRemoveIngredient}
        recurring={recurring}
        onSetRecurring={setRecurring}
        onCheckout={() => {
          setCheckoutOpen(false);
          setCheckoutPageOpen(true);
        }}
      />

      <DeliverySlotPicker
        isOpen={slotPickerOpen}
        onClose={() => setSlotPickerOpen(false)}
        selectedSlot={deliverySlot}
        onSelectSlot={setDeliverySlot}
      />

      <FooterBar grandTotal={grandTotal} onCheckout={() => setCheckoutPageOpen(true)} />
    </div>
  );
};

export default Index;
