# Apartment — Tbilisi Saburtalo

Renovated apartments for sale in Tbilisi–Saburtalo, collected from [myhome.ge](https://www.myhome.ge):

- pipeline: myhome.ge → download photos → CLIP (embedding + room label) → renovated filter → MongoDB → duplicate detection
- Express API backed by MongoDB
- static frontend for browsing, filtering, favorites, compare, and duplicates

## What is tracked in Git

- `.gitignore` and `.env.example` are committed.
- `.env` (your local settings) and `.cache/` (Chrome profile used by the collector) are **not** committed.

## Requirements

- Node.js 18+
- Google Chrome (the collector opens myhome.ge in Chrome, because Cloudflare blocks plain HTTP requests and headless browsers)
- Docker Desktop (for local MongoDB), or a MongoDB Atlas URI in `MONGODB_URI`

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run db:up
```

`npm run db:up` starts the `apartment-mongo` container (creates it the first time).

## Run

### 1. Collect listings

```powershell
npm start
```

A small Chrome window opens on myhome.ge while listings are collected, then closes.
If Cloudflare ever shows a checkbox, click it in that window — the pipeline waits up to 2 minutes.

How a run works:

1. Reads search pages (24 listings each): for sale, apartments, Tbilisi, Saburtalo.
2. Skips listings already in the database that have not changed on myhome.ge since the last run.
3. Downloads each listing's real photos and runs CLIP on them (first run downloads the model, ~600MB).
4. Labels every photo with one of: renovated room, bedroom, kitchen, bathroom, living room, building view from outside, unimproved room, balcony, city view from balcony, floor plan, yard.
5. Saves the listing only if most photos are **not** unimproved room / yard / floor plan / city view from balcony. Rejected ones go to `rejected_listings` so they are not re-checked.
6. Compares saved listings with more than 6 photos. Two listings are duplicates if ≥51% of the photos of one have a match in the other. Groups are stored in `duplicate_groups`, and listings get `duplicateOf` / `duplicateGroupSize`.

Run size and other options (PowerShell):

```powershell
$env:PIPELINE_MAX_PAGES=20; $env:PIPELINE_MAX_LISTINGS=500; npm start   # more apartments
$env:PIPELINE_START_PAGE=21; npm start                                  # continue from page 21
$env:PIPELINE_INTERVAL_MINUTES=60; npm start                            # keep refreshing every hour
```

### 2. Start the API + frontend

```powershell
npm run api
```

Open `http://localhost:3001` (the port comes from `PORT` in `.env`).

The list shows one listing per duplicate group; tick **Show duplicates** to see all of them.

## Prices

myhome.ge returns prices per currency (`"1"` = GEL, `"2"` = USD, `"3"` = EUR). We store
`price` / `pricePerSqm` in GEL and `priceUsd` / `pricePerSqmUsd` in USD, exactly as the site shows them.

## Duplicate threshold

The photo match threshold is `DUPLICATE_SIM_THRESHOLD` (default `0.92`). With `0.85`, about 12% of
photos from *different* apartments already match (similar renovations look alike to CLIP), which
chained 17 unrelated listings into one group in testing. Set it to `0.85` in `.env` if you need the
original rule, then run `npm run duplicates` to rebuild the groups without re-collecting.

## Scripts

- `npm start` — run the full pipeline
- `npm run api` — start backend + frontend
- `npm run db:up` / `npm run db:down` — start / stop MongoDB in Docker
- `npm run duplicates` — rebuild duplicate groups from what is already saved
- `npm run test:api` — open myhome.ge and print the first listing
- `npm run test:db` — verify MongoDB connectivity
- `node src/test-step6.js` — run one listing through download → CLIP → filter → save

## Troubleshooting

- `Cannot reach MongoDB` / `ECONNREFUSED 27017` — start Docker Desktop, then `npm run db:up`.
- `EADDRINUSE :3000` — port 3000 is taken (Docker uses it on this machine); keep `PORT=3001`.
- `myhome.ge did not load` — Cloudflare did not let the browser through; run again and click the check in the Chrome window if shown.
