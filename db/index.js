/**
 * Step 3: MongoDB connection and collection access.
 * Connect once, then use getListingsCollection() / getDuplicateGroupsCollection() for reads and writes.
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
  client = new MongoClient(config.mongoDbUri);
  await client.connect();
  // Database name is taken from the URI (e.g. .../apartment); default to "apartment" if missing
  const dbName = new URL(config.mongoDbUri).pathname.slice(1) || "apartment";
  db = client.db(dbName);
  // Unique index on externalId so we can upsert listings by API id
  await db.collection("listings").createIndex({ externalId: 1 }, { unique: true });
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
 * Listings collection. Document shape:
 * - _id: ObjectId (optional; can use externalId as primary key)
 * - externalId: string (API listing id)
 * - ...metadata: price, area, address, etc. (from API)
 * - photos: Array<{ url: string, embedding?: number[], label?: string }>
 * - createdAt, updatedAt: Date
 */
export function getListingsCollection() {
  return getDb().collection("listings");
}

/**
 * Duplicate groups: each doc = one group of listings that are duplicates of each other.
 * - _id: ObjectId
 * - listingIds: string[] (externalIds of listings in this group)
 * - createdAt: Date
 */
export function getDuplicateGroupsCollection() {
  return getDb().collection("duplicate_groups");
}

/**
 * Step 7: Listings with >6 photos and embeddings (for duplicate detection).
 * @returns {Promise<Array<{ externalId: string, photos: Array<{ embedding: number[] }> }>>}
 */
export async function getListingsForDuplicateDetection() {
  const coll = getListingsCollection();
  const list = await coll.find({}, { projection: { externalId: 1, photos: 1 } }).toArray();
  return list.filter((doc) => {
    const photos = doc.photos;
    if (!Array.isArray(photos) || photos.length <= 6) return false;
    return photos.every((p) => Array.isArray(p.embedding) && p.embedding.length > 0);
  });
}

/**
 * Step 6: Save one listing to MongoDB (only call for listings that pass the renovated filter).
 * @param {object} listing - { id, photoUrls, raw } from API client.
 * @param {Array<{ url: string, embedding: number[], label: string }>} clipResults - From processPhotos().
 */
export async function saveListing(listing, clipResults) {
  const coll = getListingsCollection();
  const externalId = String(listing.id);
  const photos = clipResults.map((p) => ({ url: p.url, embedding: p.embedding, label: p.label }));
  const now = new Date();
  await coll.updateOne(
    { externalId },
    {
      $set: { ...listing.raw, photos, updatedAt: now },
      $setOnInsert: { externalId, createdAt: now },
    },
    { upsert: true }
  );
}

/**
 * Step 8: Store duplicate groups in MongoDB. Replaces all existing duplicate_groups docs.
 * @param {Array<string[]>} groups - Each item is a list of externalIds (from pairsToGroups).
 */
export async function saveDuplicateGroups(groups) {
  const coll = getDuplicateGroupsCollection();
  await coll.deleteMany({});
  if (groups.length === 0) return;
  const now = new Date();
  await coll.insertMany(groups.map((listingIds) => ({ listingIds, createdAt: now })));
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
