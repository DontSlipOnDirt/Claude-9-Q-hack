import { useMemo } from "react";
import { Utensils, Euro, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { DayPlan } from "@/data/meals";

interface WeeklySummaryProps {
  mealPlan: DayPlan[];
}

const COLORS = ["hsl(145, 63%, 42%)", "hsl(0, 70%, 55%)", "hsl(35, 85%, 55%)", "hsl(280, 50%, 55%)"];

const WeeklySummary = ({ mealPlan }: WeeklySummaryProps) => {
  const stats = useMemo(() => {
    const selected = mealPlan
      .flatMap((d) => d.meals)
      .filter((m) => m.selected && m.category !== "extras");
    const count = selected.length;
    if (count === 0) return null;

    const avgPrice = selected.reduce((s, m) => s + m.price, 0) / count;

    const names = selected.map((m) => m.name.toLowerCase());
    const cuisineKeywords = ["Greek", "Asian", "Italian", "Mediterranean", "Thai", "Mexican", "Indian", "German", "French"];
    const found = cuisineKeywords.filter((k) => names.some((n) => n.includes(k.toLowerCase())));
    const cuisineText = found.length > 0 ? found.slice(0, 3).join(", ") : "Mixed";

    // Ingredient category breakdown
    const veggieKw = ["salad", "veggie", "vegetable", "avocado", "spinach", "broccoli", "quinoa", "bowl", "green", "asparagus", "carrot", "pea"];
    const meatKw = ["chicken", "salmon", "steak", "tuna", "turkey", "beef", "shrimp", "lamb", "pork", "fish"];
    const nutsKw = ["nut", "almond", "walnut", "peanut", "granola", "oat", "seed", "muesli"];
    const sugarKw = ["cake", "chocolate", "sweet", "pancake", "honey", "jam", "sugar", "dessert", "bun"];

    let veggies = 0, meat = 0, nuts = 0, sugar = 0;
    selected.forEach((m) => {
      const n = m.name.toLowerCase();
      if (veggieKw.some((k) => n.includes(k))) veggies++;
      if (meatKw.some((k) => n.includes(k))) meat++;
      if (nutsKw.some((k) => n.includes(k))) nuts++;
      if (sugarKw.some((k) => n.includes(k))) sugar++;
    });
    // Ensure at least 1 for display
    if (veggies + meat + nuts + sugar === 0) { veggies = 1; meat = 1; }

    const chartData = [
      { name: "Veggies", value: veggies },
      { name: "Meat & Fish", value: meat },
      { name: "Nuts & Grains", value: nuts || 1 },
      { name: "Sugar", value: sugar || 1 },
    ];

    return { count, avgPrice, cuisineText, chartData };
  }, [mealPlan]);

  if (!stats) return null;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 mb-4">
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-primary/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-foreground text-base">Your Week at a Glance</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          This week features <span className="font-semibold text-foreground">{stats.cuisineText}</span> inspired meals across{" "}
          <span className="font-semibold text-foreground">{stats.count} dishes</span> — enjoy a delicious variety!
        </p>

        <div className="flex gap-4 items-center">
          {/* Stats cards */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="bg-card/80 backdrop-blur-sm rounded-xl p-3 text-center">
              <Utensils className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{stats.count}</p>
              <p className="text-[11px] text-muted-foreground">Meals planned</p>
            </div>
            <div className="bg-card/80 backdrop-blur-sm rounded-xl p-3 text-center">
              <Euro className="w-4 h-4 text-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{stats.avgPrice.toFixed(2)} €</p>
              <p className="text-[11px] text-muted-foreground">Avg. price/meal</p>
            </div>
          </div>

          {/* Donut chart */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="relative w-28 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={50}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {stats.chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-bold text-foreground">{stats.count}</span>
                <span className="text-[9px] text-muted-foreground">meals</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
              {stats.chartData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[9px] text-muted-foreground">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklySummary;
