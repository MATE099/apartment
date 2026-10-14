/**
 * Step 7: Duplicate detection using CLIP embedding similarity.
 * Only between saved listings with more than 6 photos. Two listings are duplicates if
 * at least 51% of one listing's photos have a match in the other above SIM_THRESHOLD
 * (DUPLICATE_SIM_THRESHOLD in .env, see config/index.js for why the default is 0.92).
 */
import { config } from "../config/index.js";

export const SIM_THRESHOLD = config.duplicates.similarityThreshold;
export const MAJORITY_RATIO = 0.51;
export const MIN_PHOTOS = 7; // "more than 6 images"

/** Keeps only photos with an embedding and packs them as Float32Array for fast math. */
function toVectors(photos) {
  return (photos || [])
    .filter((p) => Array.isArray(p.embedding) && p.embedding.length > 0)
    .map((p) => Float32Array.from(p.embedding));
}

// Embeddings are stored unit-length, so the dot product equals cosine similarity.
function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Fraction of photos in A whose best match in B is above the threshold. */
function matchedFraction(vectorsA, vectorsB) {
  let matched = 0;
  for (const a of vectorsA) {
    for (const b of vectorsB) {
      if (dot(a, b) > SIM_THRESHOLD) {
        matched++;
        break;
      }
    }
  }
  return matched / vectorsA.length;
}

/**
 * Find all duplicate pairs.
 * @param {Array<{ externalId: string, photos: Array<{ embedding: number[] }> }>} listings
 * @returns {Array<{ a: string, b: string, score: number }>} score = share of matching photos (0..1).
 */
export function findDuplicatePairs(listings) {
  const prepared = listings
    .map((l) => ({ id: l.externalId, vectors: toVectors(l.photos) }))
    .filter((l) => l.vectors.length >= MIN_PHOTOS);

  const pairs = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      const score = Math.max(matchedFraction(a.vectors, b.vectors), matchedFraction(b.vectors, a.vectors));
      if (score >= MAJORITY_RATIO) pairs.push({ a: a.id, b: b.id, score: Math.round(score * 100) / 100 });
    }
  }
  return pairs;
}

/**
 * Step 8: Turn duplicate pairs into groups (connected components).
 * If A-B and B-C are pairs, one group is [A, B, C].
 * @returns {Array<{ listingIds: string[], pairs: Array<{ a: string, b: string, score: number }> }>}
 */
export function pairsToGroups(pairs) {
  const parent = new Map();
  function find(id) {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
    return parent.get(id);
  }
  for (const { a, b } of pairs) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const byRoot = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!byRoot.has(root)) byRoot.set(root, { listingIds: [], pairs: [] });
    byRoot.get(root).listingIds.push(id);
  }
  for (const pair of pairs) byRoot.get(find(pair.a)).pairs.push(pair);
  return [...byRoot.values()].filter((g) => g.listingIds.length >= 2);
}
