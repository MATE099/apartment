/**
 * Step 6: "Renovated only" filter.
 * We save a listing only if most photos are NOT in the excluded set.
 * Excluded: unimproved room, yard, floor plan, city view from balcony.
 */

export const EXCLUDED_LABELS = new Set([
  "unimproved room",
  "yard",
  "floor plan",
  "city view from balcony",
]);

/**
 * Returns true if the listing passes the renovated filter (we should save it).
 * Pass = fewer than half of the photos are in the excluded set.
 * @param {Array<{ label: string }>} clipResults - One entry per photo (from processPhotos).
 */
export function isRenovated(clipResults) {
  if (!clipResults.length) return false;
  const excluded = clipResults.filter((p) => EXCLUDED_LABELS.has(p.label)).length;
  return excluded < clipResults.length / 2;
}
