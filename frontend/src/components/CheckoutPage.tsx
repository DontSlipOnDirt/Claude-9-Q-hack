import { ArrowLeft, Clock, MapPin, CreditCard, ChevronDown } from "lucide-react";
import { useState } from "react";
import { deliverySlots } from "@/data/meals";
import { BasketIngredient } from "@/components/CheckoutSidebar";

interface RecurringItemState {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  quantity: number;
  added: boolean;
}

interface CheckoutPageProps {
  onBack: () => void;
  deliverySlot: string;
  onSelectSlot: (slot: string) => void;
  basketIngredients: BasketIngredient[];
  recurringItems: RecurringItemState[];
}

function OrderLineImage({ image }: { image: string }) {
  if (image.startsWith("http") || image.startsWith("/")) {
    return <img src={image} alt="" className="h-5 w-5 shrink-0 rounded object-contain" loading="lazy" decoding="async" />;
  }
  return <span>{image}</span>;
}

const CheckoutPage = ({ onBack, deliverySlot, onSelectSlot, basketIngredients, recurringItems }: CheckoutPageProps) => {
  const [slotOpen, setSlotOpen] = useState(false);

  const ingredientsTotal = basketIngredients.reduce((s, i) => s + i.price * i.quantity, 0);
  const recurringTotal = recurringItems.filter((r) => r.added).reduce((s, r) => s + r.price * r.quantity, 0);
  const subtotal = ingredientsTotal + recurringTotal;
  const deliveryFee = 1.99;
  const grandTotal = subtotal + deliveryFee;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="font-bold text-foreground text-lg">Checkout</h2>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 py-6 flex-1 space-y-6">
        {/* Delivery Time */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Delivery Time</h3>
          </div>

          <div className="relative">
            <button
              onClick={() => setSlotOpen(!slotOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground hover:bg-muted transition-colors"
            >
              <span className="font-medium">{deliverySlot}</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${slotOpen ? "rotate-180" : ""}`} />
            </button>

            {slotOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                {deliverySlots.map((day) =>
                  day.slots.map((slot) => {
                    const label = `${day.date} ${slot}`;
                    return (
                      <button
                        key={label}
                        onClick={() => { onSelectSlot(label); setSlotOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${
                          label === deliverySlot ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Delivery Address</h3>
          </div>
          <p className="text-sm text-muted-foreground">Musterstraße 12, 10115 Berlin</p>
        </div>

        {/* Order Summary */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-3">Order Summary</h3>

          {basketIngredients.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ingredients ({basketIngredients.length})</p>
              {basketIngredients.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1.5 text-sm gap-2">
                  <span className="text-foreground flex flex-col min-w-0 gap-0.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <OrderLineImage image={item.image} />
                      <span className="truncate">{item.name} × {item.quantity}</span>
                    </span>
                    {(item.sourceLabel ?? item.fromMeal) && (
                      <span className="text-[11px] text-muted-foreground pl-6 truncate">
                        {item.sourceLabel ?? item.fromMeal}
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-foreground shrink-0">{(item.price * item.quantity).toFixed(2).replace(".", ",")} €</span>
                </div>
              ))}
            </div>
          )}

          {recurringItems.filter((r) => r.added).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recurring Items</p>
              {recurringItems.filter((r) => r.added).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1.5 text-sm gap-2">
                  <span className="text-foreground flex items-center gap-1.5 min-w-0">
                    <OrderLineImage image={item.image} />
                    <span className="truncate">{item.name} × {item.quantity}</span>
                  </span>
                  <span className="font-medium text-foreground shrink-0">{(item.price * item.quantity).toFixed(2).replace(".", ",")} €</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">{subtotal.toFixed(2).replace(".", ",")} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="text-foreground">{deliveryFee.toFixed(2).replace(".", ",")} €</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">{grandTotal.toFixed(2).replace(".", ",")} €</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Payment Method</h3>
          </div>
          <p className="text-sm text-muted-foreground">Visa •••• 4242</p>
        </div>
      </div>

      {/* Place order button */}
      <div className="sticky bottom-0 bg-card border-t border-border px-4 py-4 max-w-2xl mx-auto w-full">
        <button className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-full text-sm">
          Place Order — {grandTotal.toFixed(2).replace(".", ",")} €
        </button>
      </div>
    </div>
  );
};

export default CheckoutPage;
