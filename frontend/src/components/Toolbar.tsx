import { Sparkles } from "lucide-react";

interface ToolbarProps {
  onToggleAI: () => void;
  aiOpen: boolean;
}

const Toolbar = ({ onToggleAI, aiOpen }: ToolbarProps) => (
  <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Weekly Meal Planner</span>
    <div className="flex-1" />
    <button
      onClick={onToggleAI}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        aiOpen
          ? "bg-accent text-accent-foreground"
          : "bg-secondary text-secondary-foreground border border-border"
      }`}
    >
      <Sparkles className="w-3.5 h-3.5" />
      AI Assistant
    </button>
  </div>
);

export default Toolbar;
