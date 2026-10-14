/** Config from .env */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.MONGODB_URI) console.warn("MONGODB_URI not set, using mongodb://localhost:27017/apartment");

// myhome.ge search filters: for sale (deal_types=1), apartments (real_estate_types=1),
// Tbilisi (cities=1), Vake-Saburtalo district (districts=4), Saburtalo (urbans=47).
const searchQuery = {
  deal_types: "1",
  real_estate_types: "1",
  cities: "1",
  urbans: "47",
  districts: "4",
  currency_id: "1",
  statuses: "2,3",
  area_types: "1",
};
// Optional: narrow the search to specific street IDs, e.g. MYHOME_STREETS=1146,1147,2948
if (process.env.MYHOME_STREETS) searchQuery.streets = process.env.MYHOME_STREETS;

function intFromEnv(name, fallback) {
  const value = parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  mongoDbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/apartment",
  myhome: {
    baseUrl: "https://www.myhome.ge",
    searchPath: "/udzravi-qoneba/",
    searchQuery,
    chromePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    // Cloudflare blocks headless Chrome, so a small visible window is the default.
    headless: process.env.MYHOME_HEADLESS === "true",
    // Reusing a profile keeps the Cloudflare clearance cookie between runs.
    profileDir: path.join(rootDir, ".cache", "chrome-profile"),
    pageDelayMs: intFromEnv("MYHOME_PAGE_DELAY_MS", 1500),
  },
  pipeline: {
    startPage: intFromEnv("PIPELINE_START_PAGE", 1),
    maxPages: intFromEnv("PIPELINE_MAX_PAGES", 5),
    maxListings: intFromEnv("PIPELINE_MAX_LISTINGS", 100),
    // Re-run CLIP even if the listing has not changed on myhome.ge.
    force: process.env.PIPELINE_FORCE === "true",
    // If > 0, the pipeline repeats every N minutes to keep data fresh.
    intervalMinutes: intFromEnv("PIPELINE_INTERVAL_MINUTES", 0),
  },
  duplicates: {
    // Two photos "match" above this CLIP cosine similarity. At 0.85, ~12% of photos from
    // *different* Saburtalo apartments already match (similar renovations look alike to CLIP),
    // which chains unrelated listings together; 0.92 keeps only near-identical photos.
    similarityThreshold: Number(process.env.DUPLICATE_SIM_THRESHOLD) || 0.92,
  },
};
