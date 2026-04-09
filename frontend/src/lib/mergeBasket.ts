import type { BasketIngredient } from "@/components/CheckoutSidebar";

/** Merge meal-plan lines with user-added groceries (same SKU → one row, quantities summed). */
export function mergeMealAndExtraForDisplay(
  meal: BasketIngredient[],
  extras: BasketIngredient[]
): BasketIngredient[] {
  const map = new Map<string, { meal?: BasketIngredient; extra?: BasketIngredient }>();

  for (const m of meal) {
    const cur = map.get(m.id) ?? {};
    cur.meal = cur.meal
      ? { ...cur.meal, quantity: cur.meal.quantity + m.quantity }
      : { ...m };
    map.set(m.id, cur);
  }
  for (const x of extras) {
    const cur = map.get(x.id) ?? {};
    cur.extra = cur.extra
      ? { ...cur.extra, quantity: cur.extra.quantity + x.quantity }
      : { ...x };
    map.set(x.id, cur);
  }

  const out: BasketIngredient[] = [];
  for (const [id, { meal: ml, extra: ex }] of map) {
    const mealQty = ml?.quantity ?? 0;
    const extraQty = ex?.quantity ?? 0;
    const qty = mealQty + extraQty;
    const price = ml?.price ?? ex?.price ?? 0;
    const name = ml?.name ?? ex?.name ?? id;
    const brand = ml?.brand ?? ex?.brand ?? "";
    const image = ml?.image ?? ex?.image ?? "🛒";
    const weight = `${qty}×`;

    let sourceLabel: string | undefined;
    if (mealQty > 0 && extraQty > 0) {
      sourceLabel = `${ml?.fromMeal ?? "Meals"} + ${ex?.fromMeal ?? "Groceries"}`;
    } else if (extraQty > 0 && mealQty === 0) {
      sourceLabel = ex?.fromMeal ?? "Groceries";
    }

    out.push({
      id,
      name,
      brand,
      price,
      weight,
      image,
      quantity: qty,
      fromMeal: ml?.fromMeal,
      sourceLabel,
    });
  }
  return out;
}

/** Merge basket lines that share the same SKU (e.g. same item on different days), joining `fromMeal` labels. */
export function mergeLinesBySku(lines: BasketIngredient[]): BasketIngredient[] {
  const map = new Map<string, BasketIngredient>();
  for (const line of lines) {
    const prev = map.get(line.id);
    if (!prev) {
      map.set(line.id, { ...line });
      continue;
    }
    const fromA = prev.fromMeal ?? "";
    const fromB = line.fromMeal ?? "";
    const fromMeal =
      !fromA || fromA === fromB
        ? fromB || fromA
        : !fromB
          ? fromA
          : `${fromA} · ${fromB}`;
    map.set(line.id, {
      ...prev,
      quantity: prev.quantity + line.quantity,
      fromMeal: fromMeal || undefined,
    });
  }
  return Array.from(map.values());
}
