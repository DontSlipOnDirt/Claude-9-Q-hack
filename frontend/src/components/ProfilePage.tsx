import { useState } from "react";
import { ArrowLeft, Minus, Plus, User, Check } from "lucide-react";

interface ProfilePageProps {
  onBack: () => void;
}

const dietaryOptions = [
  "Gluten-free", "Vegan", "Vegetarian", "Lactose-free",
  "Nut allergy", "Halal", "Kosher", "Low sugar",
];

const ProfilePage = ({ onBack }: ProfilePageProps) => {
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);
  const [pets, setPets] = useState(0);
  const [selectedDiets, setSelectedDiets] = useState<string[]>(["Gluten-free", "Vegan"]);
  const [dietCounts, setDietCounts] = useState<Record<string, number>>({ "Gluten-free": 1, "Vegan": 2 });

  const toggleDiet = (diet: string) => {
    setSelectedDiets((prev) => {
      if (prev.includes(diet)) {
        setDietCounts((c) => { const n = { ...c }; delete n[diet]; return n; });
        return prev.filter((d) => d !== diet);
      }
      setDietCounts((c) => ({ ...c, [diet]: 1 }));
      return [...prev, diet];
    });
  };

  const updateDietCount = (diet: string, delta: number) => {
    setDietCounts((prev) => ({ ...prev, [diet]: Math.max(1, (prev[diet] || 1) + delta) }));
  };

  const Counter = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="mb-5">
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      <div className="inline-flex items-center border border-border rounded-lg">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
          <Minus className="w-4 h-4" />
        </button>
        <span className="px-4 py-2 text-sm font-bold text-foreground min-w-[2rem] text-center">{value}</span>
        <button onClick={() => onChange(value + 1)} className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="font-bold text-foreground text-lg">Profile</h2>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 py-6 flex-1 space-y-8">
        {/* User info */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-lg">Max Mustermann</h3>
            <p className="text-sm text-muted-foreground">max@example.com</p>
          </div>
        </div>

        {/* Household */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-foreground text-base mb-1">Your Household</h3>
          <p className="text-sm text-muted-foreground mb-5">We'll tailor portions & packs</p>

          <Counter label="Adults" value={adults} onChange={setAdults} />
          <Counter label="Children" value={children} onChange={setChildren} />
          <Counter label="Pets" value={pets} onChange={setPets} />
        </div>

        {/* Dietary needs */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-foreground text-base mb-1">Dietary Needs</h3>
          <p className="text-sm text-muted-foreground mb-4">Select all that apply in your household</p>

          <div className="flex flex-wrap gap-2 mb-5">
            {dietaryOptions.map((diet) => {
              const isSelected = selectedDiets.includes(diet);
              return (
                <button
                  key={diet}
                  onClick={() => toggleDiet(diet)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    isSelected
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                  {diet}
                </button>
              );
            })}
          </div>

          {selectedDiets.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-3">How many people in household?</p>
              <div className="flex flex-wrap gap-2">
                {selectedDiets.map((diet) => (
                  <div key={diet} className="inline-flex items-center border border-border rounded-full overflow-hidden">
                    <span className="text-xs font-medium text-foreground pl-3 pr-1">{diet}:</span>
                    <button onClick={() => updateDietCount(diet, -1)} className="px-1.5 py-1 text-muted-foreground hover:text-foreground">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-foreground w-4 text-center">{dietCounts[diet] || 1}</span>
                    <button onClick={() => updateDietCount(diet, 1)} className="px-1.5 py-1 pr-2 text-muted-foreground hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 bg-card border-t border-border px-4 py-4 max-w-lg mx-auto w-full">
        <button onClick={onBack} className="w-full bg-foreground text-background font-semibold py-3.5 rounded-full text-sm">
          Save & Continue →
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
