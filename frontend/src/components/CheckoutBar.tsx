import { ShoppingCart, Clock } from "lucide-react";

interface CheckoutBarProps {
  total: number;
  itemCount: number;
  deliverySlot: string;
  onOpenCart: () => void;
  onOpenSlotPicker: () => void;
}

const CheckoutBar = ({ total, itemCount, deliverySlot, onOpenCart, onOpenSlotPicker }: CheckoutBarProps) => (
  <div className="fixed bottom-14 left-0 right-0 max-w-md mx-auto z-40">
    <div className="mx-4 bg-primary text-primary-foreground rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 cursor-pointer" onClick={onOpenCart}>
        <ShoppingCart className="w-5 h-5" />
        <div>
          <p className="text-sm font-bold">{total.toFixed(2).replace(".", ",")} €</p>
          <p className="text-xs opacity-80">{itemCount} Gerichte ausgewählt</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onOpenSlotPicker} className="flex items-center gap-1 text-xs opacity-90">
          <Clock className="w-3.5 h-3.5" />
          <span>{deliverySlot}</span>
        </button>
        <button onClick={onOpenCart} className="bg-primary-foreground text-primary font-semibold text-sm px-4 py-1.5 rounded-full">
          Bestellen
        </button>
      </div>
    </div>
  </div>
);

export default CheckoutBar;
