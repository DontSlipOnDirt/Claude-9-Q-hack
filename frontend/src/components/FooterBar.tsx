interface FooterBarProps {
  grandTotal: number;
  onCheckout: () => void;
}

const FooterBar = ({ grandTotal, onCheckout }: FooterBarProps) => (
  <div className="sticky bottom-0 bg-card border-t border-border z-20">
    <div className="max-w-app mx-auto flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basket</span>
        <span className="text-lg font-bold text-foreground">€{grandTotal.toFixed(2)}</span>
      </div>
      <button onClick={onCheckout} className="bg-primary text-primary-foreground font-semibold text-base px-6 py-2.5 rounded-full">
        Checkout
      </button>
    </div>
  </div>
);

export default FooterBar;
