import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import WeeklySummary from "@/components/WeeklySummary";
import TopBar from "@/components/TopBar";
import Toolbar from "@/components/Toolbar";
import AIPanel from "@/components/AIPanel";
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
import { mealPlanOptions, getRecipeForMeal, DayPlan, Meal, Product, recurringItems } from "@/data/meals";
import { fetchRecipes, shoppingFromMeals } from "@/lib/api";
import { weekPlanFromRecipes } from "@/lib/plannerFromRecipes";

const Index = () => {
  const [activeNav, setActiveNav] = useState("planner");
  const [activeMealFilters, setActiveMealFilters] = useState<string[]>(["breakfast", "lunch", "dinner"]);
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
  const [basketIngredients, setBasketIngredients] = useState<BasketIngredient[]>([]);
  const [favourites, setFavourites] = useState<{ id: string; name: string; brand: string; price: number; image: string }[]>([]);
  const [swapMealId, setSwapMealId] = useState<string | null>(null);
  const [checkoutPageOpen, setCheckoutPageOpen] = useState(false);
  const [easterPageOpen, setEasterPageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const appliedApiPlan = useRef(false);

  const { data: catalogRecipes } = useQuery({
    queryKey: ["planner-recipes"],
    queryFn: fetchRecipes,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!catalogRecipes?.length || appliedApiPlan.current) return;
    appliedApiPlan.current = true;
    const plan = weekPlanFromRecipes(catalogRecipes);
    setMealPlans([plan]);

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
    recurringItems.map((r) => ({ ...r, added: true, quantity: 1 }))
  );

  const mealPlan = mealPlans[activePlanIndex];

  useEffect(() => {
    const allSelectedMeals = mealPlan.flatMap((d) => d.meals).filter((m) => m.selected);
    if (allSelectedMeals.length === 0) {
      setBasketIngredients([]);
      return;
    }

    const allHaveRecipe = allSelectedMeals.every((m) => m.recipeId);

    if (!allHaveRecipe) {
      const ingredientsFromMeals: BasketIngredient[] = [];
      for (const meal of allSelectedMeals) {
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
      setBasketIngredients(ingredientsFromMeals);
      return;
    }

    let cancelled = false;
    shoppingFromMeals(
      allSelectedMeals.map((m) => ({
        recipe_id: m.recipeId as string,
        label: m.name,
      }))
    )
      .then((res) => {
        if (cancelled) return;
        const merged = new Map<string, BasketIngredient>();
        for (const row of res.detail) {
          const sku = row.sku;
          const existing = merged.get(sku);
          if (existing) {
            existing.quantity += row.quantity;
          } else {
            merged.set(sku, {
              id: sku,
              name: row.article_name,
              brand: row.ingredient_name,
              price: row.unit_price,
              weight: `${row.quantity}×`,
              image: "🛒",
              quantity: row.quantity,
              fromMeal: row.meal_label,
            });
          }
        }
        setBasketIngredients([...merged.values()]);
      })
      .catch(() => {
        if (cancelled) return;
        const ingredientsFromMeals: BasketIngredient[] = [];
        for (const meal of allSelectedMeals) {
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
        setBasketIngredients(ingredientsFromMeals);
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
    if (meal) {
      setSelectedMealData(meal);
      setSelectedRecipe(id);
    }
  };

  const filteredPlan = useMemo(
    () =>
      mealPlan.map((day) => ({
        ...day,
        meals:
          activeMealFilters.length > 0 ? day.meals.filter((m) => activeMealFilters.includes(m.category)) : day.meals,
      })),
    [mealPlan, activeMealFilters]
  );

  const handleAddToBasket = useCallback(
    (ingredients: { id: string; name: string; brand: string; price: number; weight: string; image: string; quantity: number }[]) => {
      setBasketIngredients((prev) => {
        const newItems = [...prev];
        for (const ing of ingredients) {
          const existing = newItems.find((i) => i.id === ing.id);
          if (existing) {
            existing.quantity += ing.quantity;
          } else {
            newItems.push({ ...ing });
          }
        }
        return newItems;
      });
    },
    []
  );

  const handleUpdateIngredientQty = useCallback((id: string, delta: number) => {
    setBasketIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
    );
  }, []);

  const handleRemoveIngredient = useCallback((id: string) => {
    setBasketIngredients((prev) => prev.filter((i) => i.id !== id));
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

  const handleAddProductToBasket = useCallback((product: Product) => {
    setBasketIngredients((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: product.price,
          weight: product.weight,
          image: product.image,
          quantity: 1,
        },
      ];
    });
  }, []);

  const handleRemoveOneProductFromBasket = useCallback((productId: string) => {
    setBasketIngredients((prev) => {
      const item = prev.find((i) => i.id === productId);
      if (!item) return prev;
      if (item.quantity <= 1) return prev.filter((i) => i.id !== productId);
      return prev.map((i) => (i.id === productId ? { ...i, quantity: i.quantity - 1 } : i));
    });
  }, []);

  const basketQuantityById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of basketIngredients) {
      m[i.id] = (m[i.id] ?? 0) + i.quantity;
    }
    return m;
  }, [basketIngredients]);

  const ingredientsTotal = basketIngredients.reduce((s, i) => s + i.price * i.quantity, 0);
  const recurringTotal = recurring.filter((r) => r.added).reduce((s, r) => s + r.price * r.quantity, 0);
  const grandTotal = ingredientsTotal + recurringTotal;

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

  const getSwapAlternatives = (mealId: string): Meal[] => {
    const meal = mealPlan.flatMap((d) => d.meals).find((m) => m.id === mealId);
    if (!meal) return [];
    const pool = mealPlan
      .flatMap((d) => d.meals)
      .filter((m) => m.category === meal.category && m.id !== meal.id);
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
        basketIngredients={basketIngredients}
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
          <AIPanel isOpen={aiOpen} />
          <WeeklySummary mealPlan={mealPlan} />
          <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto w-full">
            <span className="text-sm font-bold text-foreground">Week of 7 Apr 2026</span>
            <p className="text-xs text-muted-foreground">Click a meal for recipe & ingredients</p>
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
            />
          </div>
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
        basketIngredients={basketIngredients}
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
