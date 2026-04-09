import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, User, Check, Trash2, ShoppingBag } from "lucide-react";
import { loadHouseholdProfile, saveHouseholdProfile, type SavedHouseholdProfile } from "@/lib/profileStorage";
import { loadSpicyLearning, resetSpicyAvoid, SPICY_LEARNING_EVENT } from "@/lib/spicyLearning";
import {
  deleteRecurringManual,
  fetchArticles,
  fetchPreferenceTags,
  fetchRecurringManual,
  upsertRecurringManual,
  type PreferenceTag,
} from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProfilePageProps {
  customerId: string;
  onBack: () => void;
}

const CATEGORY_ORDER = ["diet", "allergy", "religious", "flavor"] as const;

const CATEGORY_LABEL: Record<string, string> = {
  diet: "Diet",
  allergy: "Allergies",
  religious: "Religious",
  flavor: "Flavor",
};

/** Spicy vs not spicy are mutually exclusive in the profile. */
const SPICY_PAIR: Record<string, string> = {
  spicy: "not_spicy",
  not_spicy: "spicy",
};

function stripFlavorConflict(
  code: string,
  diets: string[],
  counts: Record<string, number>
): { diets: string[]; counts: Record<string, number> } {
  const other = SPICY_PAIR[code];
  if (!other) return { diets: [...diets], counts: { ...counts } };
  return {
    diets: diets.filter((d) => d !== other),
    counts: Object.fromEntries(Object.entries(counts).filter(([k]) => k !== other)) as Record<string, number>,
  };
}

const ProfilePage = ({ customerId, onBack }: ProfilePageProps) => {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<SavedHouseholdProfile>(() => loadHouseholdProfile());
  const [spicyLearning, setSpicyLearning] = useState(() => loadSpicyLearning());
  const [addOpen, setAddOpen] = useState(false);
  const { adults, children, pets, selectedDiets, dietCounts } = profile;

  const [pickSku, setPickSku] = useState("");
  const [intervalDays, setIntervalDays] = useState(14);
  const [stapleQty, setStapleQty] = useState(1);

  const { data: articles } = useQuery({
    queryKey: ["catalog-articles"],
    queryFn: fetchArticles,
    staleTime: 5 * 60_000,
  });

  const { data: staples } = useQuery({
    queryKey: ["recurring-manual", customerId],
    queryFn: () => fetchRecurringManual(customerId),
    staleTime: 30_000,
  });

  const articleOptions = useMemo(() => {
    const a = articles ?? [];
    return [...a].sort((x, y) => x.name.localeCompare(y.name)).slice(0, 250);
  }, [articles]);

  const addStaple = useMutation({
    mutationFn: () =>
      upsertRecurringManual(customerId, {
        sku: pickSku,
        interval_days: intervalDays,
        default_quantity: stapleQty,
      }),
    onSuccess: () => {
      toast.success("Staple saved");
      queryClient.invalidateQueries({ queryKey: ["recurring-manual", customerId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-eligible", customerId] });
      setPickSku("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStaple = useMutation({
    mutationFn: (sku: string) => deleteRecurringManual(customerId, sku),
    onSuccess: () => {
      toast.success("Staple removed");
      queryClient.invalidateQueries({ queryKey: ["recurring-manual", customerId] });
      queryClient.invalidateQueries({ queryKey: ["recurring-eligible", customerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: catalogTags = [], isLoading: tagsLoading, isError: tagsError } = useQuery({
    queryKey: ["preference-tags", "v9"],
    queryFn: fetchPreferenceTags,
    staleTime: 60_000,
  });

  const tagsByCode = useMemo(() => {
    const m = new Map<string, PreferenceTag>();
    for (const t of catalogTags) {
      if (t.tag_type === "meal_time") continue;
      m.set(t.code, t);
    }
    return m;
  }, [catalogTags]);

  const tagsByCategory = useMemo(() => {
    const g = new Map<string, PreferenceTag[]>();
    for (const t of catalogTags) {
      if (t.tag_type === "meal_time") continue;
      const list = g.get(t.tag_type) ?? [];
      list.push(t);
      g.set(t.tag_type, list);
    }
    for (const [, list] of g) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return g;
  }, [catalogTags]);

  const addableByCategory = useMemo(() => {
    const selected = new Set(selectedDiets);
    const known = new Set<string>(CATEGORY_ORDER);
    const orderedTypes = [
      ...CATEGORY_ORDER.filter((t) => tagsByCategory.has(t)),
      ...[...tagsByCategory.keys()].filter((t) => !known.has(t)),
    ];
    const rows: { type: string; label: string; tags: PreferenceTag[] }[] = [];
    for (const type of orderedTypes) {
      const all = tagsByCategory.get(type) ?? [];
      const tags = all.filter((t) => !selected.has(t.code));
      if (tags.length === 0) continue;
      rows.push({ type, label: CATEGORY_LABEL[type] ?? type.replace(/_/g, " "), tags });
    }
    return rows;
  }, [tagsByCategory, selectedDiets]);

  useEffect(() => {
    const sync = () => setSpicyLearning(loadSpicyLearning());
    window.addEventListener(SPICY_LEARNING_EVENT, sync);
    return () => window.removeEventListener(SPICY_LEARNING_EVENT, sync);
  }, []);

  const setField = <K extends keyof SavedHouseholdProfile>(key: K, value: SavedHouseholdProfile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const displayNameForCode = (code: string) => tagsByCode.get(code)?.name ?? code.replace(/_/g, " ");

  const toggleDiet = (code: string) => {
    setProfile((prev) => {
      if (prev.selectedDiets.includes(code)) {
        const nextCounts = { ...prev.dietCounts };
        delete nextCounts[code];
        return {
          ...prev,
          selectedDiets: prev.selectedDiets.filter((d) => d !== code),
          dietCounts: nextCounts,
        };
      }
      const { diets, counts } = stripFlavorConflict(code, prev.selectedDiets, prev.dietCounts);
      return {
        ...prev,
        selectedDiets: [...diets, code],
        dietCounts: { ...counts, [code]: 1 },
      };
    });
  };

  const addDietCode = (code: string) => {
    setProfile((prev) => {
      if (prev.selectedDiets.includes(code)) return prev;
      const { diets, counts } = stripFlavorConflict(code, prev.selectedDiets, prev.dietCounts);
      return {
        ...prev,
        selectedDiets: [...diets, code],
        dietCounts: { ...counts, [code]: 1 },
      };
    });
  };

  const updateDietCount = (code: string, delta: number) => {
    setProfile((prev) => ({
      ...prev,
      dietCounts: {
        ...prev.dietCounts,
        [code]: Math.max(1, (prev.dietCounts[code] || 1) + delta),
      },
    }));
  };

  const handleSave = () => {
    saveHouseholdProfile(profile);
    onBack();
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
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-lg">Max Mustermann</h3>
            <p className="text-sm text-muted-foreground">max@example.com</p>
          </div>
        </div>

        {/* Recurring staples */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-base">Recurring staples</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Tip: on <span className="font-medium text-foreground">Items</span>, use the loop icon on a product to set this in context. Here you can review or remove staples. The basket &quot;Recurring&quot; tab only lists items once that many days have passed since your last order. One-off purchases also get a default{" "}
            <span className="font-medium text-foreground">14-day</span> rhythm until you save a staple for that SKU.
          </p>

          <div className="space-y-2 mb-5">
            {(staples ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground italic">No manual staples yet — add one below.</p>
            )}
            {(staples ?? []).map((s) => (
              <div
                key={s.sku}
                className="flex items-center gap-2 justify-between py-2 border-b border-border last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.sku} · every {s.interval_days} d · qty {s.default_quantity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStaple.mutate(s.sku)}
                  className="p-2 rounded-lg hover:bg-muted text-destructive shrink-0"
                  aria-label={`Remove ${s.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add staple</p>
          <div className="flex flex-col gap-3">
            <select
              value={pickSku}
              onChange={(e) => setPickSku(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
            >
              <option value="">Select product…</option>
              {articleOptions.map((a) => (
                <option key={a.sku} value={a.sku}>
                  {a.name} ({a.sku})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Every (days)</label>
                <select
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-[4.5rem]"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Default qty</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={stapleQty}
                  onChange={(e) => setStapleQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={!pickSku || addStaple.isPending}
                onClick={() => addStaple.mutate()}
                className="rounded-full bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 disabled:opacity-50"
              >
                Save staple
              </button>
            </div>
          </div>
        </div>

        {/* Household */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-foreground text-base mb-1">Your Household</h3>
          <p className="text-sm text-muted-foreground mb-5">We'll tailor portions & packs</p>

          <Counter label="Adults" value={adults} onChange={(v) => setField("adults", v)} />
          <Counter label="Children" value={children} onChange={(v) => setField("children", v)} />
          <Counter label="Pets" value={pets} onChange={(v) => setField("pets", v)} />
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <h3 className="font-bold text-foreground text-base">Dietary needs</h3>
              <p className="text-sm text-muted-foreground mt-1">Add needs by category — tap a chip to remove.</p>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={tagsLoading || tagsError || addableByCategory.length === 0}
              className="shrink-0 flex items-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              title="Add dietary need"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {tagsError && (
            <p className="text-xs text-destructive mt-2">Could not load dietary categories — is the API running?</p>
          )}
          {tagsLoading && <p className="text-xs text-muted-foreground mt-2">Loading options…</p>}

          <div className="flex flex-wrap gap-2 mt-4 mb-5 min-h-[2.5rem]">
            {selectedDiets.length === 0 && !tagsLoading && (
              <p className="text-sm text-muted-foreground">No dietary needs selected. Tap Add to choose from categories.</p>
            )}
            {selectedDiets.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleDiet(code)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors bg-foreground text-background border-foreground"
              >
                <Check className="w-3.5 h-3.5" />
                {displayNameForCode(code)}
              </button>
            ))}
          </div>

          {spicyLearning.avoidSpicy && (
            <div className="mb-5 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm text-foreground leading-snug">
                After several spicy meals were swapped or deselected, we stopped suggesting spicy dishes. If that was a
                mistake, you can start getting spicy suggestions again.
              </p>
              <button
                type="button"
                onClick={() => resetSpicyAvoid()}
                className="mt-3 text-sm font-semibold text-primary hover:underline"
              >
                Suggest spicy meals again
              </button>
            </div>
          )}

          {selectedDiets.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-3">How many people in household?</p>
              <div className="flex flex-wrap gap-2">
                {selectedDiets.map((code) => (
                  <div key={code} className="inline-flex items-center border border-border rounded-full overflow-hidden">
                    <span className="text-xs font-medium text-foreground pl-3 pr-1 max-w-[9rem] truncate">
                      {displayNameForCode(code)}:
                    </span>
                    <button type="button" onClick={() => updateDietCount(code, -1)} className="px-1.5 py-1 text-muted-foreground hover:text-foreground">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-foreground w-4 text-center">{dietCounts[code] || 1}</span>
                    <button type="button" onClick={() => updateDietCount(code, 1)} className="px-1.5 py-1 pr-2 text-muted-foreground hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Add dietary need</DialogTitle>
            <DialogDescription>Pick a category, then tap an option to add it to your household.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 pb-2 max-h-[min(56vh,420px)] space-y-5">
            {addableByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">All available dietary tags are already selected.</p>
            ) : (
              addableByCategory.map(({ type, label, tags }) => (
                <div key={type}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
                  <div className="flex flex-col gap-1.5">
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          addDietCode(t.code);
                        }}
                        className="flex w-full flex-col items-start rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted/60 transition-colors"
                      >
                        <span className="font-medium text-foreground">{t.name}</span>
                        {t.description ? <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="px-6 pb-6 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="w-full rounded-full bg-foreground py-2.5 text-sm font-semibold text-background sm:w-auto sm:px-8"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="sticky bottom-0 bg-card border-t border-border px-4 py-4 max-w-lg mx-auto w-full">
        <button type="button" onClick={handleSave} className="w-full bg-foreground text-background font-semibold py-3.5 rounded-full text-sm">
          Save & Continue →
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
