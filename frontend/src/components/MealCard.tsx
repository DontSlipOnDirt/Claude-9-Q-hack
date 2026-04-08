import { Trash2 } from "lucide-react";
import { Meal } from "@/data/meals";

interface MealCardProps {
  meal: Meal;
  onToggleSelect: (id: string) => void;
  onClick: (id: string) => void;
}

const MealCard = ({ meal, onToggleSelect, onClick }: MealCardProps) => (
  <div
    className={`relative flex-shrink-0 w-36 rounded-lg overflow-hidden transition-opacity ${
      !meal.selected ? "opacity-40" : ""
    }`}
  >
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(meal.id);
      }}
      className="absolute top-2 right-2 z-10 bg-card/80 backdrop-blur-sm rounded-full p-1.5 shadow-sm"
    >
      <Trash2 className={`w-3.5 h-3.5 ${meal.selected ? "text-muted-foreground" : "text-primary"}`} />
    </button>
    <div
      onClick={() => onClick(meal.id)}
      className="cursor-pointer"
    >
      <div className="bg-picnic-light-gray rounded-lg h-28 flex items-center justify-center text-5xl">
        {meal.image}
      </div>
      <div className="pt-2 pb-1">
        <p className="text-xs text-muted-foreground">{meal.category === "breakfast" ? "Frühstück" : meal.category === "lunch" ? "Mittagessen" : "Abendessen"}</p>
        <p className="text-sm font-semibold text-foreground truncate">{meal.name} ›</p>
        <p className="text-xs text-muted-foreground">{meal.brand}</p>
        <p className="text-sm font-bold text-foreground mt-0.5">{meal.price.toFixed(2).replace(".", ",")} €</p>
        <p className="text-xs text-muted-foreground">{meal.weight}</p>
      </div>
    </div>
  </div>
);

export default MealCard;
