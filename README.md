# Apartment — Tbilisi Saburtalo

Pipeline + API + frontend for apartment listings (renovated only, CLIP labels, duplicate detection).

## Setup

1. Copy `.env.example` to `.env` and set `TNET_API_URL`, `MONGODB_URI` if needed.
2. `npm install`
3. MongoDB running (e.g. local or Atlas).

## Run

**Pipeline** (fetch listings → download photos → CLIP → filter → save → duplicate detection):

```bash
npm start
```

Default: processes up to 5 listings. To process more:
- **Bash/cmd:** `PIPELINE_MAX_LISTINGS=20 npm start`
- **PowerShell:** `$env:PIPELINE_MAX_LISTINGS=20; npm start`

**API + frontend** (list apartments, open one, see photos with room labels and duplicate links):

```bash
npm run api
```

Open http://localhost:3000 — list of saved listings, click one for detail and duplicate group.

## Scripts

- `npm start` — run pipeline
- `npm run api` — run backend + serve frontend on port 3000
- `node src/test-step6.js` — test one listing: fetch → CLIP → filter → save
- `node src/test-step7.js` — test duplicate detection + save groups

## Troubleshooting

- **ECONNREFUSED localhost:27017** — MongoDB isn't running. Start MongoDB locally or set `MONGODB_URI` in `.env` to an Atlas (or other) connection string.
