/**
 * Step 3: MongoDB connection and collection access.
 * Connect once, then use the helpers below for reads and writes.
 */
import { MongoClient } from "mongodb";
import { config } from "../config/index.js";

let client = null;
let db = null;

/**
 * Connects to MongoDB using config.mongoDbUri.
 * Safe to call multiple times; reuses the same connection.
 * @returns {Promise<import("mongodb").Db>} The database instance.
 */
export async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongoDbUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Cannot reach MongoDB at ${config.mongoDbUri}. Start it with "npm run db:up" (needs Docker Desktop running). ${err.message}`);
  }
  // Database name is taken from the URI (e.g. .../apartment); default to "apartment" if missing
  const dbName = new URL(config.mongoDbUri).pathname.slice(1) || "apartment";
  db = client.db(dbName);

  const listings = db.collection("listings");
  // Unique index on externalId so we can upsert listings by myhome.ge id
  await listings.createIndex({ externalId: 1 }, { unique: true });
  // Indexes for the API's sorting and filtering
  await listings.createIndex({ updatedAt: -1 });
  await listings.createIndex({ price: 1 });
  await listings.createIndex({ area_sqm: 1 });
  await listings.createIndex({ district: 1, updatedAt: -1 });
  await db.collection("rejected_listings").createIndex({ externalId: 1 }, { unique: true });
  await db.collection("duplicate_groups").createIndex({ listingIds: 1 });
  return db;
}

/**
 * Returns the database instance. Must call connect() first (e.g. at pipeline/API startup).
 */
export function getDb() {
  if (!db) throw new Error("DB not connected. Call connect() first.");
  return db;
}

/**
 * Listings collection (renovated apartments only). Document shape:
 * - externalId: string (myhome.ge id)
 * - title, price (GEL), priceUsd, pricePerSqm, area_sqm, rooms, floor, address, district, description, sourceUrl
 * - photos: Array<{ url, thumb, label, score, embedding }>
 * - labelCounts: { [label]: number }
 * - duplicateOf?: externalId of the main listing in its duplicate group
 * - duplicateGroupSize?: set on the main listing of a group
 * - lastUpdated: string from myhome.ge, updatedAt: Date, createdAt: Date
 */
export function getListingsCollection() {
  return getDb().collection("listings");
}

/** Listings that failed the renovated filter. Kept so we don't re-run CLIP on them every time. */
export function getRejectedCollection() {
  return getDb().collection("rejected_listings");
}

/**
 * Duplicate groups: each doc = one group of listings that are duplicates of each other.
 * - listingIds: string[], primaryId: string, pairs: Array<{ a, b, score }>, createdAt: Date
 */
export function getDuplicateGroupsCollection() {
  return getDb().collection("duplicate_groups");
}

/** myhome.ge gives "2026-10-14 15:03:32" in Tbilisi time (UTC+4). */
function parseMyhomeDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T") + "+04:00");
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Remove the old fake sample listings (Unsplash photos) from earlier versions of the project. */
export async function removeSampleListings() {
  const { deletedCount } = await getListingsCollection().deleteMany({ externalId: /^sample-/ });
  return deletedCount;
}

/**
 * Tells the pipeline whether a listing was already processed and is unchanged.
 * @returns {Promise<{ status: "saved" | "rejected", lastUpdated: string } | null>}
 */
export async function getKnownListing(externalId) {
  const projection = { lastUpdated: 1 };
  const saved = await getListingsCollection().findOne({ externalId }, { projection });
  if (saved) return { status: "saved", lastUpdated: saved.lastUpdated };
  const rejected = await getRejectedCollection().findOne({ externalId }, { projection });
  if (rejected) return { status: "rejected", lastUpdated: rejected.lastUpdated };
  return null;
}

/** Puts CLIP results (matched by the thumbnail URL we downloaded) onto the listing's photos. */
function mergePhotos(listing, clipResults) {
  const byUrl = new Map(clipResults.map((r) => [r.url, r]));
  return listing.photos.map((photo) => {
    const clip = byUrl.get(photo.thumb);
    return clip
      ? { url: photo.url, thumb: photo.thumb, label: clip.label, score: Math.round(clip.score * 1000) / 1000, embedding: clip.embedding }
      : { url: photo.url, thumb: photo.thumb };
  });
}

/**
 * Step 6: Save one renovated listing to MongoDB.
 * @param {object} listing - From myhome-client toListing().
 * @param {Array<{ url: string, embedding: number[], label: string, score: number }>} clipResults
 * @param {{ counts: object }} summary - From summarizeLabels().
 */
export async function saveListing(listing, clipResults, summary) {
  const now = new Date();
  const { externalId, ...fields } = listing;
  await getListingsCollection().updateOne(
    { externalId },
    {
      $set: {
        ...fields,
        photos: mergePhotos(listing, clipResults),
        labelCounts: summary.counts,
        updatedAt: parseMyhomeDate(listing.lastUpdated) || now,
        scrapedAt: now,
      },
      $setOnInsert: { externalId, createdAt: now },
    },
    { upsert: true }
  );
  await getRejectedCollection().deleteOne({ externalId });
}

/** Records a listing that is not renovated (and removes it from listings if it was there before). */
export async function saveRejected(listing, summary) {
  const { externalId } = listing;
  await getRejectedCollection().updateOne(
    { externalId },
    { $set: { externalId, lastUpdated: listing.lastUpdated, sourceUrl: listing.sourceUrl, labelCounts: summary.counts, checkedAt: new Date() } },
    { upsert: true }
  );
  await getListingsCollection().deleteOne({ externalId });
}

/**
 * Step 7: Listings with photo embeddings (for duplicate detection).
 * The ">6 photos" rule is applied in duplicate-detection.js.
 */
export async function getListingsForDuplicateDetection() {
  return getListingsCollection()
    .find({ "photos.6": { $exists: true } }, { projection: { externalId: 1, "photos.embedding": 1 } })
    .toArray();
}

/**
 * Step 8: Store duplicate groups. Replaces all existing groups and marks listings:
 * the most recently updated listing in a group is the main one; the others get duplicateOf.
 * @param {Array<{ listingIds: string[], pairs: object[] }>} groups - From pairsToGroups().
 */
export async function saveDuplicateGroups(groups) {
  const listings = getListingsCollection();
  const groupsColl = getDuplicateGroupsCollection();
  await groupsColl.deleteMany({});
  await listings.updateMany({}, { $unset: { duplicateOf: "", duplicateGroupSize: "" } });
  if (groups.length === 0) return;

  const now = new Date();
  const docs = [];
  for (const group of groups) {
    const members = await listings
      .find({ externalId: { $in: group.listingIds } }, { projection: { externalId: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    const primaryId = members[0]?.externalId || group.listingIds[0];
    const others = group.listingIds.filter((id) => id !== primaryId);
    await listings.updateOne({ externalId: primaryId }, { $set: { duplicateGroupSize: group.listingIds.length } });
    await listings.updateMany({ externalId: { $in: others } }, { $set: { duplicateOf: primaryId } });
    docs.push({ listingIds: group.listingIds, primaryId, pairs: group.pairs, createdAt: now });
  }
  await groupsColl.insertMany(docs);
}

/**
 * Closes the MongoDB connection. Call when shutting down (e.g. pipeline done, server exit).
 */
export async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
