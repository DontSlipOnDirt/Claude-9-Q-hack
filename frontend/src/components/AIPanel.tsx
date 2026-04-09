import { useState } from "react";
import { Loader2, Send, Sparkles, Mic, MicOff } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useElevenLabsVoiceRecorder } from "@/hooks/useElevenLabsVoiceRecorder";

const presets = [
  { label: "High protein week", prompt: "Suggest a high-protein meal plan for this week" },
  { label: "Budget meals", prompt: "Suggest budget-friendly meals under €5 per meal" },
  { label: "Vegan Mon–Wed", prompt: "Make Monday to Wednesday fully vegan" },
];

interface AIPanelProps {
  isOpen: boolean;
  loading: boolean;
  onSubmitPrompt: (text: string) => void;
}

const AIPanel = ({ isOpen, loading, onSubmitPrompt }: AIPanelProps) => {
  const [input, setInput] = useState("");
  const send = (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    onSubmitPrompt(q);
  };

  const { toggle, status, transcript, error, isRecording } = useElevenLabsVoiceRecorder({
    onTranscript: send,
    onError: (message) => toast.error(message),
  });

  if (!isOpen) return null;

  return (
    <div className="bg-accent/5 border-b border-border px-4 py-4">
      <div className="max-w-app mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="font-semibold text-base text-foreground">AI Meal Assistant</span>
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={(loading && !isRecording) || status === "transcribing"}
            className={`ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
              isRecording
                ? "bg-primary text-primary-foreground animate-pulse"
                : status === "transcribing"
                  ? "bg-secondary text-secondary-foreground border border-border"
                  : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            {status === "transcribing" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            {isRecording ? "Stop & transcribe" : status === "transcribing" ? "Transcribing..." : "Voice agent"}
          </button>
        </div>
        {(isRecording || status === "transcribing" || transcript || error) && (
          <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-3">
            <div className="pt-0.5">
              {status === "transcribing" ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <div className="flex gap-1 items-end h-5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-primary rounded-full animate-pulse"
                      style={{ height: `${12 + i * 2}px`, animationDelay: `${i * 0.08}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-base text-foreground">
                {status === "transcribing"
                  ? "Sending audio to ElevenLabs..."
                  : "Listening... speak your meal preferences"}
              </span>
              {transcript && <p className="mt-1 text-sm text-muted-foreground break-words">{transcript}</p>}
              {error && <p className="mt-1 text-sm text-destructive break-words">{error}</p>}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={loading}
              onClick={() => send(p.prompt)}
              className="bg-card border border-border text-sm font-medium px-3 py-1.5 rounded-full text-foreground hover:border-accent transition-colors disabled:opacity-50"
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
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => send(input)}
            className="bg-accent text-accent-foreground px-4 py-2.5 rounded-lg text-base font-semibold disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Matching against your recipe catalog…</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Dish suggestions appear in the AI suggestions section below. Your grocery list stays in Week groceries under the planner.
          </p>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
