/** Shared types and mock catalog data for the meal planner and store UI. */

/** Catalog rows attached to the weekday "Extras" planner cell (not a recipe). */
export interface DayExtraLine {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  quantity: number;
}

export interface Meal {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  category: "breakfast" | "lunch" | "dinner" | "extras";
  selected: boolean;
  recipeId?: string;
  /** preference_tags.code values from catalog, e.g. vegan, halal */
  dietTags?: string[];
  /** Groceries for this weekday when category is "extras". */
  extrasLines?: DayExtraLine[];
}

export interface DayPlan {
  day: string;
  meals: Meal[];
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  category: string;
  discount?: number;
  isNew?: boolean;
  isRegional?: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  needed: string;
  quantity: number;
  image: string;
  alternatives: { name: string; brand: string; price: number; image: string }[];
  /** When set, merges into the basket by this catalog SKU (distinct from row `id`). */
  catalogSku?: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function seedMealsForPlanner(): DayPlan[] {
  const presets: { name: string; brand: string; emoji: string; price: number; weight: string }[] = [
    { name: "Berry Oat Bowl", brand: "Morning", emoji: "🫐", price: 4.29, weight: "320 g" },
    { name: "Avocado Toast", brand: "Urban Bakery", emoji: "🥑", price: 5.49, weight: "1 serving" },
    { name: "Greek Yogurt Parfait", brand: "Dairy Fresh", emoji: "🥛", price: 3.99, weight: "250 g" },
    { name: "Caesar Salad Bowl", brand: "GreenFork", emoji: "🥗", price: 7.99, weight: "400 g" },
    { name: "Tomato Soup & Bread", brand: "Kitchen", emoji: "🍅", price: 6.49, weight: "500 ml" },
    { name: "Chicken Wrap", brand: "StreetEat", emoji: "🌯", price: 8.29, weight: "1 wrap" },
    { name: "Pasta Primavera", brand: "Nonna", emoji: "🍝", price: 9.49, weight: "450 g" },
    { name: "Salmon & Rice", brand: "Nordic", emoji: "🐟", price: 11.99, weight: "480 g" },
    { name: "Veggie Curry", brand: "Spice Route", emoji: "🍛", price: 8.99, weight: "420 g" },
    { name: "Beef Stir-fry", brand: "Wok House", emoji: "🥩", price: 10.49, weight: "460 g" },
    { name: "Margherita Pizza", brand: "Oven", emoji: "🍕", price: 8.79, weight: "30 cm" },
    { name: "Sushi Selection", brand: "Tokyo", emoji: "🍣", price: 12.99, weight: "12 pcs" },
    { name: "Pumpkin Soup", brand: "Harvest", emoji: "🎃", price: 5.99, weight: "400 ml" },
    { name: "Quinoa Bowl", brand: "Protein+", emoji: "🥙", price: 9.29, weight: "420 g" },
    { name: "Fish & Chips", brand: "Harbour", emoji: "🍟", price: 9.99, weight: "1 portion" },
    { name: "Ratatouille", brand: "Provence", emoji: "🍆", price: 7.49, weight: "380 g" },
    { name: "BBQ Ribs", brand: "Smokehouse", emoji: "🍖", price: 13.49, weight: "600 g" },
    { name: "Pad Thai", brand: "Bangkok", emoji: "🍜", price: 9.89, weight: "450 g" },
    { name: "Chili Sin Carne", brand: "Plant", emoji: "🫘", price: 7.29, weight: "400 g" },
    { name: "Cheese Fondue Kit", brand: "Alpine", emoji: "🫕", price: 14.99, weight: "2 portions" },
    { name: "Breakfast Burrito", brand: "Rise", emoji: "🌮", price: 6.79, weight: "1 roll" },
  ];

  const cats: Meal["category"][] = ["breakfast", "lunch", "dinner", "extras"];
  let idx = 0;
  return DAYS.map((day) => ({
    day,
    meals: cats.map((category) => {
      if (category === "extras") {
        return {
          id: `meal-${day}-extras`,
          name: "Day extras",
          brand: "Groceries",
          price: 0,
          weight: "Add items",
          image: "🛒",
          category: "extras" as const,
          selected: true,
          extrasLines: [],
        };
      }
      const p = presets[idx % presets.length];
      idx += 1;
      const id = `meal-${day}-${category}-${idx}`;
      return {
        id,
        name: p.name,
        brand: p.brand,
        price: p.price,
        weight: p.weight,
        image: p.emoji,
        category,
        selected: true,
      };
    }),
  }));
}

/** Initial planner options before `/recipes` hydrates the week from the API. */
export const mealPlanOptions: { plans: DayPlan[] }[] = [{ plans: seedMealsForPlanner() }];

export function getRecipeForMeal(meal: Meal): {
  title: string;
  subtitle: string;
  heroEmoji?: string;
  prepTime: string;
  preparation: string[];
  ingredients: Ingredient[];
} {
  if (meal.category === "extras") {
    return {
      title: meal.name,
      subtitle: "Groceries",
      heroEmoji: meal.image,
      prepTime: "—",
      preparation: [],
      ingredients: [],
    };
  }
  const alt = (name: string, brand: string, price: number, image: string) => ({ name, brand, price, image });
  return {
    title: meal.name,
    subtitle: `${meal.brand} · ${meal.category}`,
    heroEmoji: meal.image,
    prepTime: "20–30 min",
    preparation: [
      "Gather ingredients and prep vegetables.",
      "Cook proteins or grains according to pack instructions.",
      "Combine, season to taste, and plate.",
    ],
    ingredients: [
      {
        id: `${meal.id}-i1`,
        name: "Main ingredient mix",
        brand: "Pantry",
        price: 2.49,
        weight: "300 g",
        needed: "recipe base",
        quantity: 1,
        image: "🥘",
        alternatives: [alt("Organic mix", "Bio", 2.99, "🌿")],
      },
      {
        id: `${meal.id}-i2`,
        name: "Fresh garnish",
        brand: "Produce",
        price: 1.19,
        weight: "80 g",
        needed: "topping",
        quantity: 1,
        image: "🥬",
        alternatives: [alt("Herb bundle", "Garden", 1.49, "🌱")],
      },
      {
        id: `${meal.id}-i3`,
        name: "Sauce / dressing",
        brand: "Deli",
        price: 1.99,
        weight: "150 ml",
        needed: "finish",
        quantity: 1,
        image: "🫙",
        alternatives: [],
      },
    ],
  };
}

export const recurringItems: Pick<Product, "id" | "name" | "brand" | "price" | "image">[] = [
  { id: "rec-milk", name: "Whole Milk 1L", brand: "Dairy Fresh", price: 1.29, image: "🥛" },
  { id: "rec-eggs", name: "Free-range Eggs 10", brand: "Farm", price: 3.49, image: "🥚" },
  { id: "rec-bread", name: "Sourdough Loaf", brand: "Urban Bakery", price: 2.99, image: "🍞" },
  { id: "rec-banana", name: "Bananas", brand: "Produce", price: 1.99, image: "🍌" },
];

export const deliverySlots: { date: string; slots: string[] }[] = [
  {
    date: "Mon 14.04",
    slots: ["10:00-11:00", "12:00-13:00", "16:00-17:00", "18:00-19:00", "19:00-20:00"],
  },
  {
    date: "Tue 15.04",
    slots: ["10:00-11:00", "12:00-13:00", "16:00-17:00", "18:00-19:00", "19:00-20:00"],
  },
  {
    date: "Wed 16.04",
    slots: ["10:00-11:00", "12:00-13:00", "16:00-17:00", "18:00-19:00"],
  },
  {
    date: "Thu 17.04",
    slots: ["12:00-13:00", "16:00-17:00", "18:00-19:00", "19:00-20:00"],
  },
  {
    date: "Fri 18.04",
    slots: ["10:00-11:00", "12:00-13:00", "18:00-19:00"],
  },
];

export const pastOrders: { id: string; status: "delivered" | "cancelled"; date: string; items: number; total: number }[] = [
  { id: "ord1042", status: "delivered", date: "2 Apr 2026", items: 12, total: 47.82 },
  { id: "ord1038", status: "delivered", date: "26 Mar 2026", items: 8, total: 31.5 },
  { id: "ord1021", status: "cancelled", date: "18 Mar 2026", items: 5, total: 19.99 },
];

export const recurringPurchaseHistory: { name: string; lastPurchased: string; avgUsageDays: number }[] = [
  { name: "Whole Milk 1L", lastPurchased: "5 Apr 2026", avgUsageDays: 7 },
  { name: "Sourdough Loaf", lastPurchased: "3 Apr 2026", avgUsageDays: 4 },
  { name: "Bananas", lastPurchased: "7 Apr 2026", avgUsageDays: 5 },
];

export const productCategories: { id: string; label: string; emoji: string }[] = [
  { id: "fruits", label: "Fruit & Veg", emoji: "🍎" },
  { id: "dairy", label: "Dairy & Eggs", emoji: "🧀" },
  { id: "meat", label: "Meat & Fish", emoji: "🥩" },
  { id: "frozen", label: "Frozen", emoji: "🧊" },
  { id: "bread", label: "Bakery", emoji: "🥖" },
  { id: "oils", label: "Oils & Sauces", emoji: "🫒" },
  { id: "drinks", label: "Drinks", emoji: "🥤" },
  { id: "snacks", label: "Snacks", emoji: "🍫" },
  { id: "coffee", label: "Coffee & Tea", emoji: "☕" },
  { id: "health", label: "Health", emoji: "💊" },
  { id: "baby", label: "Baby", emoji: "🍼" },
  { id: "cooking", label: "Cooking", emoji: "🍳" },
];

/** Fallback when the articles API is empty (merged in `ItemsPage`). */
export const products: Product[] = [
  {
    id: "demo-apples",
    name: "Apples Gala 1kg",
    brand: "Orchard",
    price: 2.99,
    weight: "1 kg",
    image: "🍎",
    category: "fruits",
    isRegional: true,
  },
  {
    id: "demo-milk",
    name: "Whole Milk 1L",
    brand: "Dairy Fresh",
    price: 1.29,
    weight: "1 L",
    image: "🥛",
    category: "dairy",
    discount: 10,
  },
  {
    id: "demo-cheese",
    name: "Gouda Slices",
    brand: "Cheese Co",
    price: 2.79,
    weight: "150 g",
    image: "🧀",
    category: "dairy",
    isNew: true,
  },
  {
    id: "demo-salmon",
    name: "Salmon Fillet",
    brand: "Nordic",
    price: 8.99,
    weight: "300 g",
    image: "🐟",
    category: "meat",
  },
  {
    id: "demo-spinach",
    name: "Baby Spinach",
    brand: "GreenFork",
    price: 1.89,
    weight: "200 g",
    image: "🥬",
    category: "fruits",
  },
  {
    id: "demo-pasta",
    name: "Durum Spaghetti",
    brand: "Nonna",
    price: 1.49,
    weight: "500 g",
    image: "🍝",
    category: "cooking",
  },
];
