export type SavedHouseholdProfile = {
  adults: number;
  children: number;
  pets: number;
  /** `preference_tags.code` values (e.g. gluten_free, vegan, lactose_intolerant). */
  selectedDiets: string[];
  dietCounts: Record<string, number>;
  /** Compressed JPEG data URL for profile photo (set in the app, not on server). */
  avatarDataUrl?: string;
};

const STORAGE_KEY = "picnic_household_profile_v1";

/** Fired after `saveHouseholdProfile` so the planner can refilter recipes. */
export const HOUSEHOLD_PROFILE_SAVED_EVENT = "picnic-household-profile-saved";

/** Old chip labels from earlier UI → `preference_tags.code` */
const LEGACY_LABEL_TO_CODE: Record<string, string> = {
  "Gluten-free": "gluten_free",
  "Vegan": "vegan",
  "Vegetarian": "vegetarian",
  "Lactose-free": "lactose_intolerant",
  "Nut allergy": "nut_allergy",
  Halal: "halal",
};

function normalizeDietCode(entry: string): string | null {
  const t = entry.trim();
  if (!t) return null;
  const legacy = LEGACY_LABEL_TO_CODE[t];
  if (legacy) return legacy;
  if (/^[a-z][a-z0-9_]*$/.test(t)) return t;
  return null;
}

function normalizeSelectedDiets(raw: string[]): string[] {
  const out: string[] = [];
  for (const x of raw) {
    const c = normalizeDietCode(x);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function buildDietCounts(
  selectedCodes: string[],
  previous: Record<string, number> | undefined,
  defaults: Record<string, number>
): Record<string, number> {
  const next: Record<string, number> = {};
  const prev = previous ?? {};
  for (const code of selectedCodes) {
    if (typeof prev[code] === "number" && prev[code] >= 1) {
      next[code] = prev[code];
      continue;
    }
    const legacyLabel = Object.entries(LEGACY_LABEL_TO_CODE).find(([, c]) => c === code)?.[0];
    if (legacyLabel && typeof prev[legacyLabel] === "number" && prev[legacyLabel] >= 1) {
      next[code] = prev[legacyLabel];
    } else {
      next[code] = defaults[code] ?? 1;
    }
  }
  for (const code of selectedCodes) {
    if (next[code] === undefined) next[code] = 1;
  }
  return next;
}

const defaults: SavedHouseholdProfile = {
  adults: 2,
  children: 1,
  pets: 0,
  selectedDiets: ["gluten_free", "vegan"],
  dietCounts: { gluten_free: 1, vegan: 2 },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadHouseholdProfile(): SavedHouseholdProfile {
  if (typeof window === "undefined") return { ...defaults, dietCounts: { ...defaults.dietCounts } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults, dietCounts: { ...defaults.dietCounts } };
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return { ...defaults, dietCounts: { ...defaults.dietCounts } };
    const adults = typeof p.adults === "number" && p.adults >= 0 ? p.adults : defaults.adults;
    const children = typeof p.children === "number" && p.children >= 0 ? p.children : defaults.children;
    const pets = typeof p.pets === "number" && p.pets >= 0 ? p.pets : defaults.pets;

    const rawDiets = Array.isArray(p.selectedDiets)
      ? p.selectedDiets.filter((x): x is string => typeof x === "string")
      : defaults.selectedDiets;
    let selectedDiets = normalizeSelectedDiets(rawDiets);
    if (selectedDiets.length === 0) {
      selectedDiets = [...defaults.selectedDiets];
    }

    const prevCounts = isRecord(p.dietCounts) ? p.dietCounts : undefined;
    const dietCounts = buildDietCounts(
      selectedDiets,
      prevCounts as Record<string, number> | undefined,
      defaults.dietCounts
    );

    const avatarRaw = p.avatarDataUrl;
    const avatarDataUrl =
      typeof avatarRaw === "string" && avatarRaw.startsWith("data:image/") && avatarRaw.length < 700_000
        ? avatarRaw
        : undefined;

    return { adults, children, pets, selectedDiets, dietCounts, avatarDataUrl };
  } catch {
    return { ...defaults, dietCounts: { ...defaults.dietCounts } };
  }
}

export function saveHouseholdProfile(profile: SavedHouseholdProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event(HOUSEHOLD_PROFILE_SAVED_EVENT));
  } catch {
    // ignore quota / private mode
  }
}
