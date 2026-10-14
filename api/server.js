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
const DEFAULT_LISTING_CURRENCY = (process.env.LISTING_CURRENCY || "GEL").toUpperCase();

await connect();

function firstDefined(...values) {
  return values.find((value) => value != null);
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/[,\s]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    return toNumber(firstDefined(value.amount, value.value, value.total, value.price));
  }
  return null;
}

function toText(value) {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  return lower === "null" || lower === "undefined" ? null : text;
}

function pickCurrency(doc) {
  const rawCurrency = firstDefined(
    toText(doc.priceCurrency),
    toText(doc.currency),
    toText(doc.currency_code),
    toText(doc.price_currency),
    toText(doc.total_price_currency),
    toText(doc.sale_price?.currency),
    toText(doc.price?.currency),
    toText(doc.total_price?.currency)
  );
  return rawCurrency ? rawCurrency.toUpperCase() : DEFAULT_LISTING_CURRENCY;
}

function pickPrice(doc) {
  return toNumber(firstDefined(
    doc.price,
    doc.total_price,
    doc.sale_price,
    doc.salePrice,
    doc.price_value,
    doc.priceValue,
    doc.details?.price,
    doc.details?.sale_price
  ));
}

function pickArea(doc) {
  return toNumber(firstDefined(
    doc.area_sqm,
    doc.area,
    doc.space,
    doc.total_area,
    doc.totalArea,
    doc.square,
    doc.square_meters,
    doc.details?.area
  ));
}

function pickRooms(doc) {
  return toNumber(firstDefined(doc.rooms, doc.bedrooms, doc.room_number, doc.roomNumber));
}

function pickFloor(doc) {
  return toNumber(firstDefined(doc.floor, doc.current_floor, doc.currentFloor));
}

function pickTotalFloors(doc) {
  return toNumber(firstDefined(doc.total_floors, doc.totalFloors, doc.floors));
}

function pickTitle(doc, externalId) {
  return firstDefined(
    toText(doc.title),
    toText(doc.statement_title),
    toText(doc.name),
    toText(doc.address),
    externalId ? `Listing ${externalId}` : "Apartment listing"
  );
}

function pickAddress(doc) {
  return firstDefined(
    toText(doc.address),
    toText(doc.street),
    toText(doc.location),
    toText(doc.full_address),
    toText(doc.address_en)
  );
}

function pickDistrict(doc) {
  return firstDefined(
    toText(doc.district),
    toText(doc.district_name),
    toText(doc.urban),
    toText(doc.region)
  );
}

function pickDescription(doc) {
  return firstDefined(
    toText(doc.description),
    toText(doc.details),
    toText(doc.additional_info),
    ""
  );
}

function pickSourceUrl(doc) {
  const url = firstDefined(
    toText(doc.sourceUrl),
    toText(doc.url),
    toText(doc.link),
    toText(doc.permalink),
    toText(doc.statement_url),
    toText(doc.source_url)
  );
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function normalizeListing(doc, options = {}) {
  const externalId = String(doc.externalId ?? doc.id ?? doc.statement_id ?? doc._id);
  const price = pickPrice(doc);
  const area = pickArea(doc);
  const rooms = pickRooms(doc);
  const floor = pickFloor(doc);
  const totalFloors = pickTotalFloors(doc);
  const priceCurrency = pickCurrency(doc);
  const allPhotos = Array.isArray(doc.photos) ? doc.photos.filter((photo) => photo?.url) : [];
  const toPublicPhoto = (photo) => ({ url: photo.url, thumb: photo.thumb || photo.url, label: photo.label, score: photo.score });
  const previewPhotos = options.includeAllPhotos
    ? allPhotos.map(toPublicPhoto)
    : allPhotos.slice(0, 1).map(toPublicPhoto);

  return {
    ...doc,
    externalId,
    title: pickTitle(doc, externalId),
    price,
    priceCurrency,
    area_sqm: area,
    rooms,
    floor,
    total_floors: totalFloors,
    address: pickAddress(doc),
    district: pickDistrict(doc),
    description: pickDescription(doc),
    sourceUrl: pickSourceUrl(doc),
    photoCount: allPhotos.length,
    pricePerSqm: doc.pricePerSqm ?? (area && price != null ? Math.round(price / area) : null),
    photos: previewPhotos,
  };
}

const LISTING_PROJECTION = { "photos.embedding": 0 };

function buildListingsFilter(query) {
  const q = (query.q || "").trim();
  const minPrice = query.minPrice ? Number(query.minPrice) : null;
  const maxPrice = query.maxPrice ? Number(query.maxPrice) : null;
  const minArea = query.minArea ? Number(query.minArea) : null;
  const maxArea = query.maxArea ? Number(query.maxArea) : null;
  const rooms = query.rooms ? String(query.rooms) : null;

  const filter = {};
  // By default show one listing per duplicate group; ?showDuplicates=1 shows all.
  if (query.showDuplicates !== "1") filter.duplicateOf = { $exists: false };
  if (q) {
    // Escape regex characters so searches like "(ჯიქია)" match literally.
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { title: pattern },
      { address: pattern },
      { description: pattern },
      { district: pattern },
    ];
  }
  if (minPrice != null && !isNaN(minPrice)) filter.price = { ...filter.price, $gte: minPrice };
  if (maxPrice != null && !isNaN(maxPrice)) filter.price = { ...filter.price, $lte: maxPrice };
  if (minArea != null && !isNaN(minArea)) filter.area_sqm = { ...filter.area_sqm, $gte: minArea };
  if (maxArea != null && !isNaN(maxArea)) filter.area_sqm = { ...filter.area_sqm, $lte: maxArea };
  if (rooms === "3+") filter.rooms = { $gte: 3 };
  else if (rooms === "1" || rooms === "2") filter.rooms = parseInt(rooms, 10);

  return filter;
}

function buildListingsSort(sort) {
  if (sort === "price_asc") return { price: 1 };
  if (sort === "price_desc") return { price: -1 };
  if (sort === "area_asc") return { area_sqm: 1 };
  if (sort === "area_desc") return { area_sqm: -1 };
  return { updatedAt: -1 };
}

function buildRelatedListingsFilter(current, externalId) {
  const filter = { externalId: { $ne: externalId } };
  const district = pickDistrict(current);
  const price = pickPrice(current);

  if (district) {
    filter.district = district;
  } else if (price != null) {
    const band = Math.max(20000, Math.floor(price * 0.2));
    filter.price = { $gte: price - band, $lte: price + band };
  }

  return filter;
}

// API: list listings with search, filters & pagination
// Query: q, minPrice, maxPrice, minArea, maxArea, rooms, sort, limit (default 12), skip (default 0)
// Response: { listings, totalCount }
app.get("/api/listings", async (req, res) => {
  try {
    const coll = getListingsCollection();
    const sort = req.query.sort || "newest";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const filter = buildListingsFilter(req.query);
    const sortOpt = buildListingsSort(sort);

    const [list, totalCount] = await Promise.all([
      coll.find(filter, { projection: LISTING_PROJECTION }).sort(sortOpt).skip(skip).limit(limit).toArray(),
      coll.countDocuments(filter),
    ]);
    const listings = list.map((doc) => normalizeListing(doc));
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
    const current = await coll.findOne({ externalId: id }, { projection: LISTING_PROJECTION });
    if (!current) return res.json({ listings: [] });

    const filter = buildRelatedListingsFilter(current, id);
    const list = await coll
      .find(filter, { projection: LISTING_PROJECTION })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    const listings = list.map((doc) => normalizeListing(doc));
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
    res.json(group ? { listingIds: group.listingIds, primaryId: group.primaryId, pairs: group.pairs || [] } : { listingIds: [] });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// API: get one listing by externalId (photos with url + label only)
app.get("/api/listings/:id", async (req, res) => {
  try {
    const coll = getListingsCollection();
    const doc = await coll.findOne({ externalId: String(req.params.id) }, { projection: LISTING_PROJECTION });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const out = normalizeListing(doc, { includeAllPhotos: true });
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
