import { Heart, ChefHat, Search, ShoppingCart, UtensilsCrossed } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  cartTotal?: number;
}

const tabs = [
  { id: "discover", label: "Entdecken", icon: UtensilsCrossed },
  { id: "favorites", label: "Favoriten", icon: Heart },
  { id: "cooking", label: "Kochen", icon: ChefHat },
  { id: "search", label: "Suchen", icon: Search },
  { id: "cart", label: "Warenkorb", icon: ShoppingCart },
];

const BottomNav = ({ activeTab, onTabChange, cartTotal }: BottomNavProps) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around py-2 px-1 z-50 max-w-md mx-auto">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs relative transition-colors ${
            isActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Icon className="w-5 h-5" />
          <span className="font-medium">{tab.label}</span>
          {tab.id === "cart" && cartTotal !== undefined && cartTotal > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartTotal.toFixed(0)}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);

export default BottomNav;
