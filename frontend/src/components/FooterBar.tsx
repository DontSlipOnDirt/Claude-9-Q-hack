import { DayPlan } from "@/data/meals";

interface FooterBarProps {
  mealPlan: DayPlan[];
  grandTotal: number;
  deliverySlot: string;
  onCheckout: () => void;
}

const FooterBar = ({ grandTotal, deliverySlot, onCheckout }: FooterBarProps) => (
  <div className="sticky bottom-0 bg-card border-t border-border z-20">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basket</span>
        <span className="text-base font-bold text-foreground">€{grandTotal.toFixed(2)}</span>
      </div>
      <button onClick={onCheckout} className="bg-primary text-primary-foreground font-semibold text-sm px-6 py-2.5 rounded-full">
        Delivery by {deliverySlot} →
      </button>
    </div>
  </div>
);

export default FooterBar;
