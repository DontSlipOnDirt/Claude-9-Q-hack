import { RefreshCw, LogOut, Heart } from "lucide-react";

interface TopBarProps {
  activeNav: string;
  onNavChange: (nav: string) => void;
  userName?: string;
  onProfileClick?: () => void;
}

const navItems = [
  { id: "planner", label: "This week" },
  { id: "items", label: "Items" },
  { id: "favourites", label: "Favourites" },
  { id: "history", label: "History" },
];

const TopBar = ({ activeNav, onNavChange, userName = "U", onProfileClick }: TopBarProps) => (
  <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
    <div className="flex items-center justify-between px-4 py-2 max-w-6xl mx-auto">
      <a href="#" className="flex items-center gap-2" onClick={() => onNavChange("planner")}>
        <div className="w-8 h-8 bg-primary-foreground rounded-lg flex items-center justify-center">
          <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
            <path d="M3.5 8.5h13l-1.4 7A1.5 1.5 0 0113.6 17H6.4a1.5 1.5 0 01-1.5-1.5L3.5 8.5z" fill="hsl(var(--primary))" />
            <path d="M7.5 8.5V6A2.5 2.5 0 0112.5 6v2.5" stroke="hsl(var(--primary))" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <span className="font-bold text-lg">Picnic</span>
      </a>
      <nav className="flex items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavChange(item.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
              activeNav === item.id
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "text-primary-foreground/70 hover:text-primary-foreground"
            }`}
          >
            {item.id === "favourites" && <Heart className="w-3.5 h-3.5" />}
            {item.label}
          </button>
        ))}
        <button className="ml-2 p-1.5 rounded-full hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded-full hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground" title="Log out">
          <LogOut className="w-4 h-4" />
        </button>
        <button onClick={onProfileClick} className="ml-1 w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold cursor-pointer hover:bg-primary-foreground/30 transition-colors">
          {userName.charAt(0).toUpperCase()}
        </button>
      </nav>
    </div>
  </header>
);

export default TopBar;
