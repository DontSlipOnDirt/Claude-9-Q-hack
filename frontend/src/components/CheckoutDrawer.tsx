import { useState } from "react";
import { X, Plus, Minus, RotateCcw } from "lucide-react";
import { DayPlan, recurringItems } from "@/data/meals";

interface CheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mealPlan: DayPlan[];
}

const CheckoutDrawer = ({ isOpen, onClose, mealPlan }: CheckoutDrawerProps) => {
  const [recurring, setRecurring] = useState(recurringItems.map((r) => ({ ...r, added: true })));

  if (!isOpen) return null;

  const selectedMeals = mealPlan.flatMap((d) => d.meals.filter((m) => m.selected));
  const mealsTotal = selectedMeals.reduce((s, m) => s + m.price, 0);
  const recurringTotal = recurring.filter((r) => r.added).reduce((s, r) => s + r.price, 0);
  const grandTotal = mealsTotal + recurringTotal;

  return (
    <div className="fixed inset-0 z-50 flex flex-col max-w-md mx-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-20 flex-1 bg-card rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-bold text-foreground text-lg">Warenkorb</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Meal items */}
          <div className="px-4 pt-3 pb-2">
            <h4 className="text-sm font-bold text-foreground mb-2">Mahlzeiten ({selectedMeals.length})</h4>
            {selectedMeals.map((meal) => (
              <div key={meal.id} className="flex items-center gap-3 py-2 border-b border-border">
                <div className="w-10 h-10 bg-picnic-light-gray rounded-lg flex items-center justify-center text-xl">{meal.image}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{meal.name}</p>
                  <p className="text-xs text-muted-foreground">{meal.brand}</p>
                </div>
                <p className="text-sm font-bold text-foreground">{meal.price.toFixed(2).replace(".", ",")} €</p>
              </div>
            ))}
          </div>

          {/* Recurring items */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="w-4 h-4 text-picnic-green" />
              <h4 className="text-sm font-bold text-foreground">Wiederkehrende Artikel</h4>
            </div>
            {recurring.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border">
                <div className="w-10 h-10 bg-picnic-light-gray rounded-lg flex items-center justify-center text-xl">{item.image}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.brand} · {item.frequency}</p>
                </div>
                <p className="text-sm font-bold text-foreground mr-2">{item.price.toFixed(2).replace(".", ",")} €</p>
                <button
                  onClick={() => setRecurring((p) => p.map((r) => r.id === item.id ? { ...r, added: !r.added } : r))}
                  className={`rounded-full p-1 ${item.added ? "bg-picnic-green/10 text-picnic-green" : "bg-secondary text-muted-foreground"}`}
                >
                  {item.added ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex justify-between mb-1">
            <span className="text-sm text-muted-foreground">Mahlzeiten</span>
            <span className="text-sm font-medium">{mealsTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">Wiederkehrend</span>
            <span className="text-sm font-medium">{recurringTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-foreground">Gesamt</span>
            <span className="font-bold text-foreground">{grandTotal.toFixed(2).replace(".", ",")} €</span>
          </div>
          <button className="w-full mt-3 bg-primary text-primary-foreground font-semibold py-3 rounded-full">
            Jetzt bestellen
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutDrawer;
