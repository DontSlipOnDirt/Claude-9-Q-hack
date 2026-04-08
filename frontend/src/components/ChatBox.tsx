import { useState } from "react";
import { MessageCircle, X, Send, Mic } from "lucide-react";

const suggestedPrompts = [
  "Vegan meals for Mon–Wed",
  "Quick dishes under 20 min",
  "Low-carb dinners this week",
  "Family-friendly lunches",
  "Gluten-free options for 3 days",
];

interface ChatBoxProps {
  floating?: boolean;
}

const ChatBox = ({ floating }: ChatBoxProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: "Hi! I'll help you with your weekly meal plan. What would you like to change?" },
  ]);
  const [input, setInput] = useState("");

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "bot", text: "Got it! Updating your meal plan now. 🍽️" },
    ]);
    setInput("");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-32 right-4 z-50 bg-primary text-primary-foreground rounded-full p-3.5 shadow-lg flex items-center gap-2 max-w-md"
      >
        <MessageCircle className="w-6 h-6" />
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-card z-50 flex flex-col max-w-md mx-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground">Meal Plan Chat</h3>
        <button onClick={() => setIsOpen(false)}>
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {suggestedPrompts.map((prompt) => (
            <button key={prompt} onClick={() => sendMessage(prompt)} className="flex-shrink-0 text-xs bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 border border-border">
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder="Type a message..."
          className="flex-1 rounded-full border border-border bg-secondary px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button onClick={() => sendMessage(input)} className="bg-primary text-primary-foreground rounded-full p-2.5">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
