import { useState } from "react";
import { X, Plus, Minus, Trash2, RotateCcw, Clock, ShoppingCart, Package } from "lucide-react";
import { DayPlan } from "@/data/meals";
import { Dispatch, SetStateAction } from "react";
function BasketLineThumb({ image }: { image: string }) {
  const isUrl = image.startsWith("http") || image.startsWith("/");
  if (isUrl) {
    return (
      <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-muted/50 ring-1 ring-border/20 shrink-0">
        <img src={image} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
      </div>
    );
  }
  return <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-lg shrink-0">{image}</div>;
}

export interface BasketIngredient {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  quantity: number;
  fromMeal?: string;
  /** Present when the line includes catalog groceries or meal + extras. */
  sourceLabel?: string;
}

interface RecurringItemState {
  id: string;
  name: string;
  brand: string;
  price: number;
  weight: string;
  image: string;
  frequency: string;
  added: boolean;
  quantity: number;
}

interface CheckoutSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  mealPlan: DayPlan[];
  deliverySlot: string;
  onOpenSlotPicker: () => void;
  basketIngredients: BasketIngredient[];
  onUpdateIngredientQty: (id: string, delta: number) => void;
  onRemoveIngredient: (id: string) => void;
  recurring: RecurringItemState[];
  onSetRecurring: Dispatch<SetStateAction<RecurringItemState[]>>;
}

const CheckoutSidebar = ({ isOpen, onToggle, mealPlan, deliverySlot, onOpenSlotPicker, basketIngredients, onUpdateIngredientQty, onRemoveIngredient, recurring, onSetRecurring }: CheckoutSidebarProps) => {
  const [activeTab, setActiveTab] = useState<"ingredients" | "recurring">("ingredients");

  const ingredientsTotal = basketIngredients.reduce((s, i) => s + i.price * i.quantity, 0);
  const recurringTotal = recurring.filter((r) => r.added).reduce((s, r) => s + r.price * r.quantity, 0);
  const grandTotal = ingredientsTotal + recurringTotal;

  const updateRecurringQty = (id: string, delta: number) => {
    onSetRecurring((p) => p.map((r) => r.id === id ? { ...r, quantity: Math.max(0, r.quantity + delta), added: r.quantity + delta > 0 } : r));
  };

  return (
    <>
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-primary text-primary-foreground p-3 rounded-l-lg shadow-lg flex flex-col items-center gap-1"
        style={{ right: isOpen ? "400px" : "0" }}
      >
        <ShoppingCart className="w-5 h-5" />
        <span className="text-xs font-bold">{grandTotal.toFixed(2).replace(".", ",")} €</span>
        <span className="text-[10px] opacity-80">{basketIngredients.length + recurring.filter((r) => r.added).length}</span>
      </button>

      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-card border-l border-border z-30 flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-lg">Basket</h3>
          </div>
          <button onClick={onToggle}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("ingredients")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === "ingredients" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <Package className="w-4 h-4" />
            Ingredients ({basketIngredients.length})
          </button>
          <button
            onClick={() => setActiveTab("recurring")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === "recurring" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            Recurring ({recurring.filter((r) => r.added).length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "ingredients" ? (
            <div className="px-4 pt-3 pb-2">
              {basketIngredients.length === 0 && <p className="text-sm text-muted-foreground italic py-4">No ingredients in basket yet</p>}
              {basketIngredients.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3 border-b border-border">
                  <BasketLineThumb image={item.image} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.brand} · {item.weight}
                      {(item.sourceLabel ?? item.fromMeal) && (
                        <span className="text-muted-foreground/90"> · {item.sourceLabel ?? item.fromMeal}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 border border-border rounded-full px-1">
                    <button onClick={() => onUpdateIngredientQty(item.id, -1)} className="p-1">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => onUpdateIngredientQty(item.id, 1)} className="p-1">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-foreground w-14 text-right">{(item.price * item.quantity).toFixed(2).replace(".", ",")} €</p>
                  <button onClick={() => onRemoveIngredient(item.id)} className="p-1 hover:bg-muted rounded">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))}
              {basketIngredients.length > 0 && (
                <div className="flex justify-between py-3 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-bold text-foreground">{ingredientsTotal.toFixed(2).replace(".", ",")} €</span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 pt-3 pb-2">
              <p className="text-xs text-muted-foreground mb-3">Suggested items — running low soon</p>
              {recurring.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3 border-b border-border">
                  <BasketLineThumb image={item.image} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.brand} · {item.frequency}</p>
                  </div>
                  {item.added ? (
                    <div className="flex items-center gap-1 border border-border rounded-full px-1">
                      <button onClick={() => updateRecurringQty(item.id, -1)} className="p-1">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                      <button onClick={() => updateRecurringQty(item.id, 1)} className="p-1">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetRecurring((p) => p.map((r) => r.id === item.id ? { ...r, added: true, quantity: 1 } : r))}
                      className="rounded-full p-1.5 bg-secondary text-muted-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <p className="text-sm font-bold text-foreground w-14 text-right">{(item.price * (item.added ? item.quantity : 0)).toFixed(2).replace(".", ",")} €</p>
                </div>
              ))}
              <div className="flex justify-between py-3 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-bold text-foreground">{recurringTotal.toFixed(2).replace(".", ",")} €</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-4">
          <button onClick={onOpenSlotPicker} className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 hover:text-foreground transition-colors">
            <Clock className="w-3.5 h-3.5" />
            <span>{deliverySlot}</span>
            <span className="text-accent font-medium ml-1">Change</span>
          </button>
          <div className="flex justify-between mb-1 text-sm">
            <span className="text-muted-foreground">Ingredients</span>
            <span className="font-medium text-foreground">{ingredientsTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <div className="flex justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Recurring</span>
            <span className="font-medium text-foreground">{recurringTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <div className="flex justify-between mb-4">
            <span className="font-bold text-foreground text-lg">Total</span>
            <span className="font-bold text-foreground text-lg">{grandTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <button className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-full text-sm">
            Delivery by {deliverySlot} →
          </button>
        </div>
      </div>
    </>
  );
};

export default CheckoutSidebar;
