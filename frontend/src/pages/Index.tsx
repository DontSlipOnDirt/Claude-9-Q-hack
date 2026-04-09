import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import MealSwapPage from "@/components/MealSwapPage";
import CheckoutPage from "@/components/CheckoutPage";
import EasterPage from "@/components/EasterPage";
import ProfilePage from "@/components/ProfilePage";
import {
  mealPlanOptions,
  getRecipeForMeal,
  DayPlan,
  Meal,
  Product,
  recurringItems,
  type DayExtraLine,
} from "@/data/meals";
import { fetchCustomers, fetchRecipes, shoppingFromMeals, speakText, voiceAgentTurn } from "@/lib/api";
import { weekPlanFromRecipes } from "@/lib/plannerFromRecipes";
import { mergeMealAndExtraForDisplay, mergeLinesBySku } from "@/lib/mergeBasket";
import { toast } from "@/components/ui/sonner";

const GROCERIES_LABEL = "Groceries";

const Index = () => {
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
  const [swapMealId, setSwapMealId] = useState<string | null>(null);
  const [checkoutPageOpen, setCheckoutPageOpen] = useState(false);
  const [easterPageOpen, setEasterPageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [aiMatches, setAiMatches] = useState<
    { id: string; name: string; reason?: string; estimated_price?: number }[]
  >([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCatalogEmpty, setAiCatalogEmpty] = useState(false);
  const [voiceInitialized, setVoiceInitialized] = useState(false);
  const [pendingActions, setPendingActions] = useState<Array<Record<string, unknown>>>([]);
  const spokenAudioRef = useRef<HTMLAudioElement | null>(null);

  const appliedApiPlan = useRef(false);

  const mealPlan = mealPlans[activePlanIndex];

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    staleTime: 5 * 60_000,
  });

  const activeCustomerId = customers?.[0]?.id ?? "";

  const stopAssistantPlayback = useCallback(() => {
    if (!spokenAudioRef.current) return;
    spokenAudioRef.current.pause();
    spokenAudioRef.current.currentTime = 0;
    spokenAudioRef.current.src = "";
    spokenAudioRef.current = null;
  }, []);

  const buildCurrentPlanForAgent = useCallback(() => {
    return mealPlan.flatMap((day) =>
      day.meals
        .filter((meal) => meal.category !== "extras")
        .map((meal) => ({
          day: day.day,
          category: meal.category,
          name: meal.name,
          recipe_id: meal.recipeId ?? "",
        }))
    );
  }, [mealPlan]);

  const speakAssistant = useCallback(async (text: string) => {
    const spokenText = text.trim();
    if (!spokenText) return;
    stopAssistantPlayback();
    const audioBlob = await speakText(spokenText);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    spokenAudioRef.current = audio;
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.onerror = () => URL.revokeObjectURL(audioUrl);
    await audio.play().catch(() => URL.revokeObjectURL(audioUrl));
  }, [stopAssistantPlayback]);

  const applyVoiceActionToPlan = useCallback(
    (action: Record<string, unknown> | null | undefined) => {
      if (!action) return;

      const actionType = String(action.type ?? "").trim();
      if (actionType === "swap_meal") {
        const target = (action.target ?? {}) as { day?: string; category?: string };
        const recipe = (action.recipe ?? {}) as { id?: string; name?: string; estimated_price?: number };
        const targetDay = String(target.day ?? "").trim().toLowerCase();
        const targetCategory = String(target.category ?? "").trim().toLowerCase();
        const nextRecipeId = String(recipe.id ?? "").trim();
        const nextRecipeName = String(recipe.name ?? "").trim();
        const nextRecipePrice = Number(recipe.estimated_price ?? 0);
        if (!targetDay || !targetCategory || !nextRecipeId || !nextRecipeName) return;

        setMealPlans((prev) =>
          prev.map((plan, pi) =>
            pi === activePlanIndex
              ? plan.map((day) => ({
                  ...day,
                  meals: day.meals.map((meal) => {
                    if (
                      day.day.toLowerCase() !== targetDay ||
                      meal.category.toLowerCase() !== targetCategory ||
                      meal.category === "extras"
                    ) {
                      return meal;
                    }
                    return {
                      ...meal,
                      recipeId: nextRecipeId,
                      name: nextRecipeName,
                      brand: "Picnic",
                      selected: true,
                      price: Number.isFinite(nextRecipePrice)
                        ? Math.round(nextRecipePrice * 100) / 100
                        : meal.price,
                    };
                  }),
                }))
              : plan
          )
        );
        return;
      }

      if (actionType === "move_meal") {
        const moveFrom = (action.from ?? {}) as { day?: string; category?: string };
        const moveTo = (action.to ?? {}) as { day?: string; category?: string };
        const fromDay = String(moveFrom.day ?? "").trim().toLowerCase();
        const fromCategory = String(moveFrom.category ?? "").trim().toLowerCase();
        const toDay = String(moveTo.day ?? "").trim().toLowerCase();
        const toCategory = String(moveTo.category ?? "").trim().toLowerCase();
        if (!fromDay || !fromCategory || !toDay || !toCategory) return;

        setMealPlans((prev) =>
          prev.map((plan, pi) => {
            if (pi !== activePlanIndex) return plan;

            let sourceMeal: Meal | null = null;
            let destinationMeal: Meal | null = null;
            for (const day of plan) {
              if (day.day.toLowerCase() === fromDay) {
                sourceMeal = day.meals.find((meal) => meal.category.toLowerCase() === fromCategory) ?? null;
              }
              if (day.day.toLowerCase() === toDay) {
                destinationMeal = day.meals.find((meal) => meal.category.toLowerCase() === toCategory) ?? null;
              }
            }
            if (!sourceMeal || !destinationMeal) return plan;

            return plan.map((day) => ({
              ...day,
              meals: day.meals.map((meal) => {
                const dayName = day.day.toLowerCase();
                if (dayName === fromDay && meal.category.toLowerCase() === fromCategory) {
                  return { ...destinationMeal };
                }
                if (dayName === toDay && meal.category.toLowerCase() === toCategory) {
                  return { ...sourceMeal };
                }
                return meal;
              }),
            }));
          })
        );
      }
    },
    [activePlanIndex]
  );

  const pendingActionSummary = useMemo(() => {
    const first = pendingActions[0] as
      | {
          type?: string;
          target?: { day?: string; category?: string };
          recipe?: { name?: string };
          from?: { day?: string; category?: string };
          to?: { day?: string; category?: string };
          reason?: string;
        }
      | undefined;
    if (!first) return null;
    const type = String(first.type ?? "");
    if (type === "swap_meal") {
      const day = String(first.target?.day ?? "this day");
      const category = String(first.target?.category ?? "meal");
      const recipeName = String(first.recipe?.name ?? "a new meal");
      const reason = String(first.reason ?? "").trim();
      return `Proposed swap: ${day} ${category} -> ${recipeName}${reason ? `. ${reason}` : ""}`;
    }
    if (type === "move_meal") {
      const fromDay = String(first.from?.day ?? "");
      const fromCategory = String(first.from?.category ?? "");
      const toDay = String(first.to?.day ?? "");
      const toCategory = String(first.to?.category ?? "");
      return `Proposed move: ${fromDay} ${fromCategory} <-> ${toDay} ${toCategory}`.trim();
    }
    return "I have a pending plan update ready to apply.";
  }, [pendingActions]);

  const slotExtrasBasket = useMemo(() => {
    const lines: BasketIngredient[] = [];
    for (const day of mealPlan) {
      const slot = day.meals.find((m) => m.category === "extras");
      // Do not require `selected`: the trash toggle only dims the card; saved extras should still count.
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
    queryKey: ["planner-recipes"],
    queryFn: fetchRecipes,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!catalogRecipes?.length || appliedApiPlan.current) return;
    appliedApiPlan.current = true;
    const plan = weekPlanFromRecipes(catalogRecipes);
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

    const slots = plan
      .flatMap((d) => d.meals)
      .filter((m): m is Meal & { recipeId: string } => Boolean(m.recipeId));
    let cancelled = false;
    shoppingFromMeals(slots.map((m) => ({ recipe_id: m.recipeId, label: m.id })))
      .then((res) => {
        if (cancelled) return;
        const totals = new Map<string, number>();
        for (const row of res.detail) {
          const key = row.meal_label;
          totals.set(key, (totals.get(key) ?? 0) + row.line_total);
        }
        setMealPlans((prev) =>
          prev.map((week) =>
            week.map((day) => ({
              ...day,
              meals: day.meals.map((m) => {
                const t = totals.get(m.id);
                if (t === undefined) return m;
                return { ...m, price: Math.round(t * 100) / 100 };
              }),
            }))
          )
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [catalogRecipes]);

  const { data: apiRecipePreview, isLoading: apiRecipeLoading } = useQuery({
    queryKey: ["recipe-preview", selectedMealData?.recipeId],
    queryFn: () =>
      shoppingFromMeals([
        {
          recipe_id: selectedMealData!.recipeId!,
          label: selectedMealData!.name,
        },
      ]),
    enabled: Boolean(selectedMealData?.recipeId && selectedRecipe),
  });

  const [recurring, setRecurring] = useState(
    recurringItems.map((r) => ({
      ...r,
      weight: "",
      frequency: "Weekly",
      added: true,
      quantity: 1,
    }))
  );

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
    shoppingFromMeals(
      recipeMeals.map((m) => ({
        recipe_id: m.recipeId as string,
        label: m.name,
      }))
    )
      .then((res) => {
        if (cancelled) return;
        const metaBySku = new Map<
          string,
          { article_name: string; ingredient_name: string; meal_label: string }
        >();
        for (const row of res.detail) {
          if (!metaBySku.has(row.sku)) {
            metaBySku.set(row.sku, {
              article_name: row.article_name,
              ingredient_name: row.ingredient_name,
              meal_label: row.meal_label,
            });
          }
        }
        const merged: BasketIngredient[] = [];
        for (const line of res.checkout_lines) {
          const meta = metaBySku.get(line.sku);
          if (!meta) continue;
          merged.push({
            id: line.sku,
            name: line.name,
            brand: meta.ingredient_name,
            price: line.unit_price,
            weight: `${line.quantity}×`,
            image: "🛒",
            quantity: line.quantity,
            fromMeal: meta.meal_label,
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

  const toggleMealSelection = (id: string) =>
    setMealPlans((prev) =>
      prev.map((plan, pi) =>
        pi === activePlanIndex
          ? plan.map((day) => ({
              ...day,
              meals: day.meals.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m)),
            }))
          : plan
      )
    );

  const handleClickMeal = (id: string) => {
    const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === id);
    if (!meal) return;
    if (meal.category === "extras") {
      setExtrasDialogMealId(id);
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

  useEffect(() => {
    if (!aiOpen || voiceInitialized || !activeCustomerId) return;
    let cancelled = false;

    const initVoiceSession = async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await voiceAgentTurn({
          customer_id: activeCustomerId,
          initialize: true,
          current_plan: buildCurrentPlanForAgent(),
          pending_actions: [],
        });
        if (cancelled) return;
        setVoiceInitialized(true);
        setPendingActions(res.proposed_actions ?? []);
        setAiMatches([]);
        setAiCatalogEmpty(false);
        await speakAssistant(res.assistant_text || "Your weekly plan briefing is ready.");
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof Error ? e.message : String(e);
        setAiError(`Voice session could not initialize: ${err.slice(0, 200)}`);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };

    void initVoiceSession();
    return () => {
      cancelled = true;
    };
  }, [activeCustomerId, aiOpen, buildCurrentPlanForAgent, speakAssistant, voiceInitialized]);

  const handleAiPrompt = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) return;
    if (!activeCustomerId) {
      setAiError("No customer found to start the voice assistant session.");
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiCatalogEmpty(false);
    setAiMatches([]);

    const normalized = q.toLowerCase();
    const hasPendingActions = pendingActions.length > 0;
    const isConfirm = /^(yes|yeah|yep|ok|okay|sure|confirm|do it|apply|sounds good|go ahead)([.! ]*)$/i.test(normalized);
    const isDecline = /^(no|nope|cancel|stop|don't|do not|nah|skip that)([.! ]*)$/i.test(normalized);

    try {
      if (hasPendingActions && isDecline) {
        setPendingActions([]);
        await speakAssistant("Okay, I will not apply that change.");
        setAiLoading(false);
        return;
      }

      const turnResponse =
        hasPendingActions && isConfirm
          ? await voiceAgentTurn({
              customer_id: activeCustomerId,
              confirmed_action_id: String(pendingActions[0]?.id ?? ""),
              pending_actions: pendingActions,
              current_plan: buildCurrentPlanForAgent(),
            })
          : await voiceAgentTurn({
              customer_id: activeCustomerId,
              transcript: q,
              current_plan: buildCurrentPlanForAgent(),
              pending_actions: pendingActions,
            });

      const rawMatches =
        (turnResponse.data?.matches as
          | { id: string; name: string; reason?: string; estimated_price?: number }[]
          | undefined) ||
        (turnResponse.data?.candidate_matches as
          | { id: string; name: string; reason?: string; estimated_price?: number }[]
          | undefined) ||
        [];
      const matches = Array.isArray(rawMatches) ? rawMatches : [];
      setAiMatches(matches);
      setAiCatalogEmpty(matches.length === 0 && turnResponse.tools_used.includes("match_dishes"));
      setPendingActions(turnResponse.proposed_actions ?? []);

      const appliedAction = turnResponse.applied_action as
        | Record<string, unknown>
        | undefined
        | null;

      applyVoiceActionToPlan(appliedAction);

      await speakAssistant(turnResponse.assistant_text || "Done.");
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setAiMatches([]);
      setAiCatalogEmpty(false);
      setAiError(`Voice agent turn failed: ${err.slice(0, 200)}`);
      setAiLoading(false);
      return;
    } finally {
      setAiLoading(false);
    }
  }, [activeCustomerId, applyVoiceActionToPlan, buildCurrentPlanForAgent, pendingActions, speakAssistant]);

  const handleConfirmPendingAction = useCallback(async () => {
    if (!activeCustomerId || pendingActions.length === 0) return;
    const actionId = String(pendingActions[0]?.id ?? "").trim();
    if (!actionId) return;

    setAiLoading(true);
    setAiError(null);
    try {
      const res = await voiceAgentTurn({
        customer_id: activeCustomerId,
        confirmed_action_id: actionId,
        pending_actions: pendingActions,
        current_plan: buildCurrentPlanForAgent(),
      });
      applyVoiceActionToPlan((res.applied_action as Record<string, unknown> | null | undefined) ?? null);
      setPendingActions([]);
      await speakAssistant(res.assistant_text || "Done.");
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setAiError(`Could not confirm pending action: ${err.slice(0, 200)}`);
    } finally {
      setAiLoading(false);
    }
  }, [activeCustomerId, applyVoiceActionToPlan, buildCurrentPlanForAgent, pendingActions, speakAssistant]);

  const handleCancelPendingAction = useCallback(async () => {
    setPendingActions([]);
    await speakAssistant("Okay, I canceled that change.");
  }, [speakAssistant]);

  useEffect(() => {
    return () => {
      stopAssistantPlayback();
    };
  }, [stopAssistantPlayback]);

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
                  };
                }),
              }))
            : plan
        )
      );
      toast.success(`Replaced with “${recipe.name}”`);
    },
    [activePlanIndex]
  );

  const getSwapAlternatives = (mealId: string): Meal[] => {
    const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === mealId);
    if (!meal || meal.category === "extras") return [];
    const pool = mealPlan
      .flatMap((d) => d.meals)
      .filter((m) => m.category === meal.category && m.id !== meal.id && m.category !== "extras");
    const unique = pool.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    return unique.slice(0, 3);
  };

  if (swapMealId) {
    const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === swapMealId);
    if (meal) {
      return (
        <MealSwapPage
          meal={meal}
          alternatives={getSwapAlternatives(swapMealId)}
          onBack={() => setSwapMealId(null)}
          onSwap={handleSwapMeal}
        />
      );
    }
  }

  if (profileOpen) {
    return <ProfilePage onBack={() => setProfileOpen(false)} />;
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
          image: "🛒",
          alternatives: [] as { name: string; brand: string; price: number; image: string }[],
        }));
        return (
          <RecipeDetail
            title={selectedMealData.name}
            subtitle="From your Picnic catalog"
            heroEmoji={selectedMealData.image}
            calories={selectedMealData.calories || 400}
            prepTime="—"
            preparation={["Ingredients from recipe → article mapping in your SQLite database."]}
            ingredients={ingredients}
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
        calories={recipe.calories}
        prepTime={recipe.prepTime}
        preparation={recipe.preparation}
        ingredients={recipe.ingredients}
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
          <AIPanel
            isOpen={aiOpen}
            loading={aiLoading}
            onSubmitPrompt={handleAiPrompt}
            onVoiceStart={stopAssistantPlayback}
            pendingActionSummary={pendingActionSummary}
            onConfirmPendingAction={() => {
              void handleConfirmPendingAction();
            }}
            onCancelPendingAction={() => {
              void handleCancelPendingAction();
            }}
          />
          <WeeklySummary mealPlan={mealPlan} />
          <AiSuggestionsSection
            aiMatches={aiMatches}
            aiLoading={aiLoading}
            aiError={aiError}
            aiCatalogEmpty={aiCatalogEmpty}
          />
          <div className="px-4 pt-2 max-w-6xl mx-auto w-full">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per-weekday</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 max-w-6xl mx-auto w-full">
            <span className="text-sm font-bold text-foreground">Week of 7 Apr 2026</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveNav("items")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Browse all groceries
              </button>
              <p className="text-xs text-muted-foreground">Click a meal for recipe & ingredients</p>
            </div>
          </div>
          <div className="flex-1 px-4 max-w-6xl mx-auto w-full pb-4">
            <PlannerGrid
              filteredPlan={filteredPlan}
              activeMealFilters={activeMealFilters}
              onToggleSelect={toggleMealSelection}
              onClickMeal={handleClickMeal}
              onRemoveColumn={toggleMealFilter}
              onToggleFavourite={toggleFavourite}
              favouriteIds={favourites.map((f) => f.id)}
              onSwapMeal={(id) => setSwapMealId(id)}
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
      />

      <DeliverySlotPicker
        isOpen={slotPickerOpen}
        onClose={() => setSlotPickerOpen(false)}
        selectedSlot={deliverySlot}
        onSelectSlot={setDeliverySlot}
      />

      <FooterBar
        mealPlan={mealPlan}
        grandTotal={grandTotal}
        deliverySlot={deliverySlot}
        onCheckout={() => setCheckoutPageOpen(true)}
      />
    </div>
  );
};

export default Index;
