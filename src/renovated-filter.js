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
 * Counts how many photos got each label. Photos CLIP could not read ("unknown") are ignored.
 * @param {Array<{ label: string }>} clipResults - One entry per photo (from processPhotos).
 */
export function summarizeLabels(clipResults) {
  const counts = {};
  let classified = 0;
  let excluded = 0;
  for (const { label } of clipResults) {
    if (!label || label === "unknown") continue;
    counts[label] = (counts[label] || 0) + 1;
    classified++;
    if (EXCLUDED_LABELS.has(label)) excluded++;
  }
  return { counts, classified, excluded };
}

/**
 * Returns true if the listing passes the renovated filter (we should save it).
 * Pass = fewer than half of the classified photos are in the excluded set.
 */
export function isRenovated(clipResults) {
  const { classified, excluded } = summarizeLabels(clipResults);
  if (classified === 0) return false;
  return excluded < classified / 2;
}
