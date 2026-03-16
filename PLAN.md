# Apartment Project — Plan

## 1. Data source

- **API:** `https://api-statements.tnet.ge/v1/statements`
- **Method:** GET (parameters as JSON)
- **Auth:** None
- **Filters (for our use):**
  - Deal type: **for sale only**
  - Location: **Tbilisi, Saburtalo**
  - Real estate type: **apartments**
  - Pagination: loop `page` until no more results

Parameters (IDs to be confirmed for Saburtalo): `deal_types`, `real_estate_types`, `cities`, `urbans`, `districts`, `currency_id`, `statuses`, `area_types`, `page`. Optional: `streets`.

---

## 2. Storage

- **Database:** MongoDB
- Store: listing data + photo URLs, CLIP embeddings per photo, room-type label(s) per photo, duplicate relationships.

---

## 3. Runnable process (pipeline)

One process that runs: fetch → filter (renovated only) → save → vectorise & classify → duplicate detection → store duplicates.

---

## 4. Photo classification (CLIP)

- **Model:** CLIP
- **Labels (exact):**
  - renovated room
  - bedroom
  - kitchen
  - bathroom
  - living room
  - building view from outside
  - unimproved room
  - balcony
  - city view from balcony
  - floor plan
  - yard

For each photo: get CLIP embedding + assign one or more labels (e.g. top-1 or multi-label above threshold). Store embedding and label(s) in DB.

---

## 5. Which apartments to save (“renovated only”)

- Save only apartments that count as **renovated**.
- **Rule:** Most of the listing’s photos must **not** be in this set:
  - unimproved room
  - yard
  - floor plan
  - city view from balcony
- If most photos fall in the “excluded” set, do **not** save the listing.

---

## 6. Duplicate detection (CLIP similarity)

- **Scope:** Only between apartments already saved (renovated, in DB).
- **Condition:** Both apartments must have **more than 6 images**.
- **Rule:** Two apartments are **duplicates** if the **majority of images (≥51%)** are **more than 85% similar** (CLIP cosine similarity > 0.85).
- Comparison: e.g. for each image in one apartment, max similarity to the other apartment’s images; ≥51% of that apartment’s images must have this max > 0.85 (implementation detail to confirm in code).

---

## 7. Duplicates in the database

- **Do not delete** duplicates. **Store** the duplicate relationship in MongoDB (e.g. duplicate pairs or duplicate_group_id / `duplicate_of`) so they can be queried and shown.

---

## 8. Pipeline summary (order of steps)

1. Fetch listings from API (sale, Tbilisi–Saburtalo), paginate.
2. For each listing: get photos, download.
3. For each photo: CLIP → embedding + classification with the 11 labels.
4. **Filter:** Keep only listings where most photos are NOT in {unimproved room, yard, floor plan, city view from balcony}. Save those to MongoDB (listing + photos + embeddings + labels).
5. **Duplicate detection:** Among saved listings with >6 images, compare pairs with CLIP; if ≥51% of images >85% similar, mark as duplicate.
6. **Persist:** Store duplicate links/groups in the database.

---

## 9. Fullstack architecture

- **Frontend** — Web app (e.g. React, Next.js, or Vue) where users browse apartments, open a listing, see photos with room-type tags, view duplicate groups, and optionally search/filter.
- **Backend API** — HTTP server (e.g. Node/Express or Python/FastAPI) that reads from MongoDB and exposes endpoints for the frontend: list apartments, get one by id, get duplicates, search/filter.
- **Database** — MongoDB. Filled by the pipeline; read by the backend API.
- **Data pipeline** — Separate runnable process (script or worker): fetches from tnet API → CLIP (embed + classify) → renovated filter → save to MongoDB → duplicate detection → store duplicate links. Can run on demand or on a schedule.

So: **Frontend ↔ Backend API ↔ MongoDB**; the **pipeline** runs independently and writes into MongoDB.

---

## 10. Implementation steps (divided for building)

Each step is a unit we can explain, then implement, then move to the next.

### Data pipeline (backend processing)

| Step | Name | What we do | Depends on |
|------|------|------------|------------|
| **1** | Project setup | Create folder structure (`/src`, `/config`, `/db`), dependency file (e.g. `package.json` or `requirements.txt`), config for API base URL and MongoDB connection string (e.g. `.env`). | — |
| **2** | API client | Module that calls `api-statements.tnet.ge/v1/statements` with JSON params (deal type sale, Tbilisi–Saburtalo, apartments). Handle pagination (`page`), parse response, extract listing IDs and photo URLs. | 1 |
| **3** | MongoDB connection & schema | Connect to MongoDB. Define collections and document shape: listings (metadata + photo URLs), and where we store embeddings, labels, and duplicate links. | 1 |
| **4** | Photo download | For each listing from the API, get photo URLs and download images (to memory or temp files) so CLIP can read them. | 2 |
| **5** | CLIP integration | Load CLIP model. For each image: encode to vector (embedding) and classify with the 11 text labels. Output: embedding + label(s) per photo. | 1, 4 |
| **6** | Renovated filter & save | Apply “renovated only” rule: most photos must NOT be in {unimproved room, yard, floor plan, city view from balcony}. For listings that pass, save to MongoDB: listing data + photos + embeddings + labels. | 3, 5 |
| **7** | Duplicate detection | Among saved listings with >6 images each, compare every pair with CLIP (e.g. cosine similarity). If ≥51% of one listing’s images have similarity >0.85 to the other, mark as duplicate. | 3, 5 |
| **8** | Store duplicates in DB | Persist duplicate relationships (e.g. duplicate pairs or `duplicate_of` / group id) in MongoDB. No deletion of duplicates. | 3, 7 |
| **9** | Main pipeline | One entry point (e.g. `npm run start` or `python run.py`) that runs: fetch → download → CLIP (embed + classify) → filter renovated → save → duplicate detection → store duplicates. | 2, 4, 5, 6, 7, 8 |

### Backend API (serves frontend)

| Step | Name | What we do | Depends on |
|------|------|------------|------------|
| **10** | Backend API server | HTTP server (e.g. Express or FastAPI). Endpoints: list apartments (optional search/filter), get apartment by id, get duplicate group. Reads from MongoDB. | 1, 3 |

### Frontend

| Step | Name | What we do | Depends on |
|------|------|------------|------------|
| **11** | Frontend app | Web UI: list/grid of apartments, detail page (photos + room-type tags), view duplicate groups. Calls backend API. | 10 |

---

## 11. How we'll implement (learning-first)

Before writing code for each step:

1. **Explain what** we're building (goal and outcome).
2. **Explain why** we're doing it this way (reasoning, trade-offs).
3. **Explain how** it works (concepts, flow).
4. **Then write** the code, with comments on important lines.

---

*Ready to implement. Start with Step 1 when you want.*
