/**
 * Step 7: Duplicate detection using CLIP embedding similarity.
 * Only between saved listings with >6 images. Two listings are duplicates if
 * ≥51% of one listing's images have cosine similarity > 0.85 to the other's.
 */

const SIM_THRESHOLD = 0.85;
const MAJORITY_RATIO = 0.51;

function cosine(a, b) {
  let dot = 0, la = 0, lb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    la += a[i] * a[i];
    lb += b[i] * b[i];
  }
  const d = Math.sqrt(la) * Math.sqrt(lb);
  return d === 0 ? 0 : dot / d;
}

/** For each image in A, max similarity to any image in B. Returns fraction that are > threshold. */
function fractionAboveThreshold(photosA, photosB, threshold) {
  let count = 0;
  for (const pa of photosA) {
    const embA = pa.embedding;
    if (!embA?.length) continue;
    let maxSim = -1;
    for (const pb of photosB) {
      const embB = pb.embedding;
      if (!embB?.length) continue;
      const sim = cosine(embA, embB);
      if (sim > maxSim) maxSim = sim;
    }
    if (maxSim > threshold) count++;
  }
  return photosA.length ? count / photosA.length : 0;
}

/**
 * Find all duplicate pairs from a list of listings (each with externalId and photos with embeddings).
 * Both listings must have >6 photos; callers should pass only such listings.
 * @param {Array<{ externalId: string, photos: Array<{ embedding: number[] }> }>} listings - From getListingsForDuplicateDetection().
 * @returns {Array<[string, string]>} Pairs of externalIds that are duplicates (each pair once, id order arbitrary).
 */
export function findDuplicatePairs(listings) {
  const pairs = [];
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i];
      const b = listings[j];
      const fracA = fractionAboveThreshold(a.photos, b.photos, SIM_THRESHOLD);
      const fracB = fractionAboveThreshold(b.photos, a.photos, SIM_THRESHOLD);
      if (fracA >= MAJORITY_RATIO || fracB >= MAJORITY_RATIO) {
        pairs.push([a.externalId, b.externalId]);
      }
    }
  }
  return pairs;
}

/**
 * Step 8: Turn duplicate pairs into groups (connected components).
 * If A-B and B-C are pairs, one group is [A, B, C].
 * @param {Array<[string, string]>} pairs - From findDuplicatePairs().
 * @returns {Array<string[]>} Each element is a list of externalIds in one duplicate group (size >= 2).
 */
export function pairsToGroups(pairs) {
  const parent = new Map();
  function find(id) {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
    return parent.get(id);
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const [a, b] of pairs) {
    union(a, b);
  }
  const byRoot = new Map();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(id);
  }
  return [...byRoot.values()].filter((g) => g.length >= 2);
}
