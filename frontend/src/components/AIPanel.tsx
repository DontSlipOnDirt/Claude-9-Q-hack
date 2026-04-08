import { useState } from "react";
import { Send, Sparkles, Mic, MicOff } from "lucide-react";
import { matchDishes } from "@/lib/api";

const presets = [
  { label: "High protein week", prompt: "Suggest a high-protein meal plan for this week" },
  { label: "Budget meals", prompt: "Suggest budget-friendly meals under €5 per meal" },
  { label: "Vegan Mon–Wed", prompt: "Make Monday to Wednesday fully vegan" },
];

interface AIPanelProps {
  isOpen: boolean;
}

const AIPanel = ({ isOpen }: AIPanelProps) => {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const send = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setLoading(true);
    setInput("");
    setMessage("");
    try {
      const res = await matchDishes(q);
      const lines = (res.matches || []).map((m) => `• ${m.name}${m.reason ? ` — ${m.reason}` : ""}`);
      setMessage(
        lines.length
          ? `Matches from your catalog:\n${lines.join("\n")}`
          : "No strong matches in the catalog — try different wording."
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setMessage(
        err.includes("503") || err.toLowerCase().includes("openai")
          ? "AI matching unavailable — add `openai.env` with OPENAI_KEY or check API logs."
          : `Could not reach match-dishes: ${err.slice(0, 200)}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-accent/5 border-b border-border px-4 py-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="font-semibold text-sm text-foreground">AI Meal Assistant</span>
          <button
            type="button"
            onClick={() => setVoiceActive((v) => !v)}
            className={`ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              voiceActive ? "bg-primary text-primary-foreground animate-pulse" : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            {voiceActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {voiceActive ? "Stop listening" : "Voice agent"}
          </button>
        </div>
        {voiceActive && (
          <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full animate-pulse"
                  style={{ height: `${12 + Math.random() * 16}px`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <span className="text-sm text-foreground">Listening… speak your meal preferences</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={loading}
              onClick={() => send(p.prompt)}
              className="bg-card border border-border text-xs font-medium px-3 py-1.5 rounded-full text-foreground hover:border-accent transition-colors disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="e.g. 'No nuts, 2 adults + 1 child, prefer Italian'…"
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => send(input)}
            className="bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {loading && <p className="mt-2 text-sm text-muted-foreground">Matching against your recipe catalog…</p>}
        {message && (
          <p className="mt-2 text-sm text-accent font-medium whitespace-pre-line">{message}</p>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
