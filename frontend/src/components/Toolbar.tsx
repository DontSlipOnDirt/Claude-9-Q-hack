import { Sparkles } from "lucide-react";

interface ToolbarProps {
  onToggleAI: () => void;
  aiOpen: boolean;
}

const Toolbar = ({ onToggleAI, aiOpen }: ToolbarProps) => (
  <div className="bg-card border-b border-border">
    <div className="max-w-app mx-auto w-full px-4 py-3 flex items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Weekly Meal Planner</span>
      <div className="flex-1" />
      <button
        onClick={onToggleAI}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
          aiOpen
            ? "bg-accent text-accent-foreground"
            : "bg-secondary text-secondary-foreground border border-border"
        }`}
      >
        <Sparkles className="w-4 h-4" />
        AI Assistant
      </button>
    </div>
  </div>
);

export default Toolbar;
