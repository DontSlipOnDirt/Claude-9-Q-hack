import { useState } from "react";
import { ArrowLeft, Heart, Share2, Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Ingredient } from "@/data/meals";

interface RecipeDetailProps {
  title: string;
  subtitle: string;
  heroEmoji?: string;
  calories: number;
  prepTime: string;
  preparation: string[];
  ingredients: Ingredient[];
  onBack: () => void;
  onAddToBasket: (ingredients: { id: string; name: string; brand: string; price: number; weight: string; image: string; quantity: number }[]) => void;
  onToggleFavourite: (id: string) => void;
  isFavourite: boolean;
  mealId: string;
}

const RecipeDetail = ({ title, subtitle, heroEmoji, calories, prepTime, preparation, ingredients, onBack, onAddToBasket, onToggleFavourite, isFavourite, mealId }: RecipeDetailProps) => {
  const [tab, setTab] = useState<"ingredients" | "preparation">("ingredients");
  const [items, setItems] = useState(ingredients.map((i) => ({ ...i })));
  const [portions, setPortions] = useState(4);
  const [addedToBasket, setAddedToBasket] = useState(false);

  const updateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      )
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const currentTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleAddToBasket = () => {
    const toAdd = items.filter((i) => i.quantity > 0).map((i) => ({
      id: i.id, name: i.name, brand: i.brand, price: i.price, weight: i.weight, image: i.image, quantity: i.quantity,
    }));
    onAddToBasket(toAdd);
    setAddedToBasket(true);
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <button onClick={onBack}><ArrowLeft className="w-6 h-6 text-foreground" /></button>
        <h1 className="font-semibold text-foreground text-lg flex-1 text-center truncate px-2">{title}</h1>
        <div className="flex gap-3">
          <button onClick={() => onToggleFavourite(mealId)}>
            <Heart className={`w-6 h-6 ${isFavourite ? "text-primary fill-primary" : "text-foreground"}`} />
          </button>
          <Share2 className="w-6 h-6 text-foreground" />
        </div>
      </div>

      <div className="h-48 bg-muted flex items-center justify-center text-8xl">{heroEmoji || "🍽️"}</div>

      <div className="px-4 pt-3 pb-2 bg-card">
        <p className="text-sm text-accent font-medium">{subtitle}</p>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>🔥 {calories} kcal</span>
          <span>⏱️ {prepTime}</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => setPortions(Math.max(1, portions - 1))} className="w-10 h-10 border border-border rounded-full flex items-center justify-center">
            <Minus className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold">{portions} portions</p>
            <p className="text-sm font-bold text-primary">{currentTotal.toFixed(2).replace(".", ",")} €</p>
          </div>
          <button onClick={() => setPortions(portions + 1)} className="w-10 h-10 border border-border rounded-full flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={handleAddToBasket}
          className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-medium text-sm transition-colors ${
            addedToBasket ? "bg-accent/10 text-accent border border-accent" : "bg-primary text-primary-foreground"
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {addedToBasket ? "✓ Added" : "Add to basket"}
        </button>
      </div>

      <div className="flex gap-2 px-4 py-3 bg-card">
        <button onClick={() => setTab("ingredients")} className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === "ingredients" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
          Ingredients
        </button>
        <button onClick={() => setTab("preparation")} className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === "preparation" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
          Preparation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-card">
        {tab === "ingredients" ? (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-4">
                <div className="w-24 h-20 bg-muted rounded-xl flex flex-col items-center justify-center flex-shrink-0 relative">
                  <span className="text-3xl">{item.image}</span>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between bg-card/90 rounded-full border border-border px-1">
                    <button onClick={() => updateQty(item.id, -1)} className="p-1"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-xs font-bold">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="p-1"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.brand}</p>
                  <p className="font-bold text-foreground">{(item.price * item.quantity).toFixed(2).replace(".", ",")} €</p>
                  <p className="text-xs text-muted-foreground">{item.weight} ({item.needed})</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="flex-shrink-0 p-2 hover:bg-muted rounded-lg">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-4">
            <ol className="space-y-4">
              {preparation.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">{i + 1}</span>
                  <p className="text-sm text-foreground pt-1">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeDetail;
