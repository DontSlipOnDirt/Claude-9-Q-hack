import { Heart } from "lucide-react";

interface FavouritesPageProps {
  favourites: { id: string; name: string; brand: string; price: number; image: string }[];
  onRemove: (id: string) => void;
}

const FavouritesPage = ({ favourites, onRemove }: FavouritesPageProps) => (
  <div className="max-w-6xl mx-auto w-full px-4 py-6">
    <h2 className="text-xl font-bold text-foreground mb-4">My Favourites</h2>
    {favourites.length === 0 ? (
      <div className="text-center py-16 text-muted-foreground">
        <Heart className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg">No favourites yet</p>
        <p className="text-sm mt-1">Tap the heart icon on recipes to save them here</p>
      </div>
    ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {favourites.map((item) => (
          <div key={item.id} className="bg-card border border-border rounded-xl p-3 relative">
            <button onClick={() => onRemove(item.id)} className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted">
              <Heart className="w-4 h-4 text-primary fill-primary" />
            </button>
            <div className="h-20 flex items-center justify-center text-4xl mb-2">{item.image}</div>
            <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.brand}</p>
            <p className="text-sm font-bold text-foreground mt-1">{item.price.toFixed(2).replace(".", ",")} €</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default FavouritesPage;
