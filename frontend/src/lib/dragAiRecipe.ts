/** MIME type for dragging an AI-matched recipe onto a planner meal slot. */
export const AI_RECIPE_DRAG_MIME = "application/x-picnic-ai-recipe";

export type AiRecipeDragPayload = { id: string; name: string; price: number };

export function parseAiRecipeDrag(dataTransfer: DataTransfer): AiRecipeDragPayload | null {
  const raw = dataTransfer.getData(AI_RECIPE_DRAG_MIME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (
      v &&
      typeof v === "object" &&
      "id" in v &&
      "name" in v &&
      typeof (v as AiRecipeDragPayload).id === "string" &&
      typeof (v as AiRecipeDragPayload).name === "string"
    ) {
      const priceRaw = (v as { price?: unknown }).price;
      const price =
        typeof priceRaw === "number" && Number.isFinite(priceRaw)
          ? priceRaw
          : typeof priceRaw === "string" && priceRaw.trim() !== ""
            ? Number.parseFloat(priceRaw)
            : 0;
      return {
        id: (v as AiRecipeDragPayload).id,
        name: (v as AiRecipeDragPayload).name,
        price: Number.isFinite(price) ? price : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
