interface FilterChipsProps {
  filters: string[];
  activeFilters: string[];
  onToggle: (filter: string) => void;
}

const FilterChips = ({ filters, activeFilters, onToggle }: FilterChipsProps) => (
  <div className="flex gap-2 overflow-x-auto py-2 px-4 scrollbar-hide">
    {filters.map((filter) => {
      const isActive = activeFilters.includes(filter);
      return (
        <button
          key={filter}
          onClick={() => onToggle(filter)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground border border-border"
          }`}
        >
          {filter}
        </button>
      );
    })}
  </div>
);

export default FilterChips;
