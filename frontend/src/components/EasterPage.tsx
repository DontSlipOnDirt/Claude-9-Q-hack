import { ArrowLeft, ShoppingCart, Star } from "lucide-react";
import { Product } from "@/data/meals";

interface EasterPageProps {
  onBack: () => void;
  onAddToBasket: (product: Product) => void;
}

const easterMenus = [
  { id: "em1", name: "Roasted Lamb with Herbs", brand: "Easter Special", price: 14.99, weight: "800g", image: "🍖", category: "easter", description: "Tender lamb with rosemary and thyme, served with roasted potatoes" },
  { id: "em2", name: "Asparagus Cream Soup", brand: "Seasonal Pick", price: 5.49, weight: "2 portions", image: "🥣", category: "easter", description: "Fresh white asparagus soup with crème fraîche and chives" },
  { id: "em3", name: "Carrot Cake", brand: "Easter Bakery", price: 8.99, weight: "600g", image: "🥕", category: "easter", description: "Moist carrot cake with cream cheese frosting and walnuts" },
  { id: "em4", name: "Salmon en Croûte", brand: "Premium Easter", price: 16.99, weight: "750g", image: "🐟", category: "easter", description: "Atlantic salmon wrapped in puff pastry with spinach and dill" },
  { id: "em5", name: "Spring Vegetable Risotto", brand: "Seasonal Pick", price: 7.99, weight: "2 portions", image: "🍚", category: "easter", description: "Creamy risotto with peas, asparagus, and parmesan" },
  { id: "em6", name: "Hot Cross Buns", brand: "Easter Bakery", price: 3.99, weight: "6 pcs", image: "🧁", category: "easter", description: "Classic spiced buns with raisins and a sweet glaze" },
];

const easterItems = [
  { id: "ei1", name: "Tulip Bouquet", brand: "BloomFresh", price: 9.99, weight: "10 stems", image: "🌷", category: "easter" },
  { id: "ei2", name: "Daffodil Arrangement", brand: "BloomFresh", price: 7.49, weight: "8 stems", image: "🌻", category: "easter" },
  { id: "ei3", name: "Easter Egg Set", brand: "Lindt", price: 12.99, weight: "12 pcs", image: "🥚", category: "easter" },
  { id: "ei4", name: "Chocolate Bunny", brand: "Lindt", price: 5.99, weight: "200g", image: "🐰", category: "easter" },
  { id: "ei5", name: "Mini Chocolate Eggs", brand: "Milka", price: 4.49, weight: "250g", image: "🍫", category: "easter" },
  { id: "ei6", name: "Easter Egg Dye Kit", brand: "Creative", price: 3.99, weight: "1 kit", image: "🎨", category: "easter" },
  { id: "ei7", name: "Praline Easter Eggs", brand: "Ferrero", price: 8.99, weight: "150g", image: "🍬", category: "easter" },
  { id: "ei8", name: "Spring Wreath", brand: "HomeDecor", price: 14.99, weight: "1 pc", image: "🌿", category: "easter" },
];

const EasterPage = ({ onBack, onAddToBasket }: EasterPageProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-yellow-200 px-4 py-4">
        <div className="max-w-app mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-card rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🐣</span>
              <div>
                <h1 className="text-xl font-bold text-foreground">Easter Specials</h1>
                <p className="text-sm text-muted-foreground">Festive menus, treats & decorations</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-app mx-auto w-full px-4 py-6 flex-1">
        {/* Easter Menus */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Easter Menus</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {easterMenus.map((menu) => (
              <div key={menu.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 h-32 flex items-center justify-center text-6xl">
                  {menu.image}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-foreground text-sm">{menu.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{menu.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <span className="text-sm font-bold text-foreground">{menu.price.toFixed(2).replace(".", ",")} €</span>
                      <span className="text-xs text-muted-foreground ml-1">/ {menu.weight}</span>
                    </div>
                    <button
                      onClick={() => onAddToBasket(menu)}
                      className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold hover:scale-105 transition-transform"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Easter Items */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🌷</span>
            <h2 className="text-lg font-bold text-foreground">Flowers, Eggs & Chocolate</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {easterItems.map((item) => (
              <div key={item.id} className="bg-card border border-border rounded-xl p-3 flex flex-col hover:shadow-md transition-shadow">
                <div className="h-20 flex items-center justify-center text-4xl mb-2">{item.image}</div>
                <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.brand} · {item.weight}</p>
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-sm font-bold text-foreground">{item.price.toFixed(2).replace(".", ",")} €</span>
                  <button
                    onClick={() => onAddToBasket(item)}
                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EasterPage;
