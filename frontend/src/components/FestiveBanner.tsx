import { Gift } from "lucide-react";

interface FestiveBannerProps {
  onExplore?: () => void;
}

const FestiveBanner = ({ onExplore }: FestiveBannerProps) => (
  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-yellow-200">
    <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
      <span className="text-2xl">🐣</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">Discover Easter Menus</p>
        <p className="text-xs text-muted-foreground">Festive dishes for the holidays</p>
      </div>
      <button onClick={onExplore} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-full">
        <Gift className="w-3.5 h-3.5" />
        Explore
      </button>
    </div>
  </div>
);

export default FestiveBanner;
