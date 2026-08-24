/**
 * Step 10: Backend API. List apartments, get by id, get duplicate groups.
 * Run: npm run api   (or node api/server.js)
 */
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { connect, getListingsCollection, getDuplicateGroupsCollection } from "../db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Default 3000 matches README; override if busy: PORT=3001 npm run api
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

await connect();

// API: list listings with search, filters & pagination
// Query: q, minPrice, maxPrice, minArea, maxArea, rooms, sort, limit (default 12), skip (default 0)
// Response: { listings, totalCount }
app.get("/api/listings", async (req, res) => {
  try {
    const coll = getListingsCollection();
    const q = (req.query.q || "").trim().toLowerCase();
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const minArea = req.query.minArea ? Number(req.query.minArea) : null;
    const maxArea = req.query.maxArea ? Number(req.query.maxArea) : null;
    const rooms = req.query.rooms ? String(req.query.rooms) : null;
    const sort = req.query.sort || "newest";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);

    const filter = {};
    if (q) {
      filter.$or = [
        { title: new RegExp(q, "i") },
        { address: new RegExp(q, "i") },
        { description: new RegExp(q, "i") },
        { district: new RegExp(q, "i") },
      ];
    }
    if (minPrice != null && !isNaN(minPrice)) { filter.price = { ...filter.price, $gte: minPrice }; }
    if (maxPrice != null && !isNaN(maxPrice)) { filter.price = { ...filter.price, $lte: maxPrice }; }
    if (minArea != null && !isNaN(minArea)) { filter.area_sqm = { ...filter.area_sqm, $gte: minArea }; }
    if (maxArea != null && !isNaN(maxArea)) { filter.area_sqm = { ...filter.area_sqm, $lte: maxArea }; }
    if (rooms === "3+") filter.rooms = { $gte: 3 };
    else if (rooms === "1" || rooms === "2") filter.rooms = parseInt(rooms, 10);

    let sortOpt = { updatedAt: -1 };
    if (sort === "price_asc") sortOpt = { price: 1 };
    else if (sort === "price_desc") sortOpt = { price: -1 };
    else if (sort === "area_asc") sortOpt = { area_sqm: 1 };
    else if (sort === "area_desc") sortOpt = { area_sqm: -1 };

    const [list, totalCount] = await Promise.all([
      coll.find(filter, { projection: { "photos.embedding": 0 } }).sort(sortOpt).skip(skip).limit(limit).toArray(),
      coll.countDocuments(filter),
    ]);
    const listings = list.map((doc) => {
      const photos = doc.photos || [];
      const first = photos[0];
      const price = doc.price;
      const area = doc.area_sqm || doc.area;
      return {
        ...doc,
        photoCount: photos.length,
        pricePerSqm: area && price != null ? Math.round(price / area) : null,
        photos: first ? [{ url: first.url, label: first.label }] : [],
      };
    });
    res.json({ listings, totalCount });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// API: related listings (same district or similar price) — route must be before /:id
app.get("/api/listings/related/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 4));
    const coll = getListingsCollection();
    const current = await coll.findOne({ externalId: id }, { projection: { district: 1, price: 1 } });
    if (!current) return res.json({ listings: [] });
    const filter = { externalId: { $ne: id } };
    if (current.district) filter.district = current.district;
    else if (current.price != null) {
      const band = Math.max(20000, Math.floor(current.price * 0.2));
      filter.price = { $gte: current.price - band, $lte: current.price + band };
    }
    const list = await coll
      .find(filter, { projection: { "photos.embedding": 0 } })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    const listings = list.map((doc) => {
      const photos = doc.photos || [];
      const first = photos[0];
      const price = doc.price;
      const area = doc.area_sqm || doc.area;
      return {
        ...doc,
        photoCount: photos.length,
        pricePerSqm: area && price != null ? Math.round(price / area) : null,
        photos: first ? [{ url: first.url, label: first.label }] : [],
      };
    });
    res.json({ listings });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// API: get duplicate group for one listing (must be before /api/listings/:id)
app.get("/api/listings/:id/duplicates", async (req, res) => {
  try {
    const id = String(req.params.id);
    const coll = getDuplicateGroupsCollection();
    const group = await coll.findOne({ listingIds: id });
    res.json(group ? { listingIds: group.listingIds } : { listingIds: [] });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// API: get one listing by externalId (photos with url + label only)
app.get("/api/listings/:id", async (req, res) => {
  try {
    const coll = getListingsCollection();
    const doc = await coll.findOne({ externalId: String(req.params.id) });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const out = { ...doc, photos: (doc.photos || []).map((p) => ({ url: p.url, label: p.label })) };
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// API: all duplicate groups
app.get("/api/duplicate-groups", async (req, res) => {
  try {
    const coll = getDuplicateGroupsCollection();
    const list = await coll.find({}).toArray();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const server = app.listen(PORT, () => {
  const port = server.address().port;
  console.log("API running at http://localhost:" + port);
});
