/**
 * Step 9: Main pipeline.
 * myhome.ge → download photos → CLIP (embed + classify) → renovated filter → save → duplicate detection → store duplicates.
 * Run: npm start
 * Size: PIPELINE_MAX_PAGES (24 listings per page) and PIPELINE_MAX_LISTINGS limit one run.
 */
import { config } from "../config/index.js";
import {
  connect,
  close,
  saveListing,
  saveRejected,
  getKnownListing,
  removeSampleListings,
  getListingsForDuplicateDetection,
  saveDuplicateGroups,
} from "../db/index.js";
import { fetchAllListings } from "./myhome-client.js";
import { downloadListingPhotos } from "./photo-download.js";
import { loadClip, processPhotos } from "./clip.js";
import { isRenovated, summarizeLabels } from "./renovated-filter.js";
import { findDuplicatePairs, pairsToGroups } from "./duplicate-detection.js";

const { startPage, maxPages, maxListings, force, intervalMinutes } = config.pipeline;

async function collectListings() {
  const stats = { seen: 0, unchanged: 0, saved: 0, rejected: 0, noPhotos: 0 };

  for await (const listing of fetchAllListings({ startPage, maxPages })) {
    if (stats.saved + stats.rejected >= maxListings) break;
    stats.seen++;

    if (!listing.photos.length) {
      stats.noPhotos++;
      continue;
    }

    // Skip listings we already processed, unless they were edited on myhome.ge since then.
    const known = await getKnownListing(listing.externalId);
    if (!force && known && known.lastUpdated === listing.lastUpdated) {
      stats.unchanged++;
      continue;
    }

    const tag = `[${stats.saved + stats.rejected + 1}/${maxListings}] ${listing.externalId}`;
    // Thumbnails (~770px) are plenty for CLIP, which works at 224px, and download much faster.
    const photos = await downloadListingPhotos(listing.photos.map((p) => p.thumb));
    if (!photos.length) {
      console.log(`${tag}: photos could not be downloaded, skipped`);
      continue;
    }

    const clipResults = await processPhotos(photos);
    const summary = summarizeLabels(clipResults);
    const labels = Object.entries(summary.counts).map(([label, n]) => `${label} ×${n}`).join(", ");

    if (isRenovated(clipResults)) {
      await saveListing(listing, clipResults, summary);
      stats.saved++;
      console.log(`${tag}: saved (renovated) — ${listing.price ?? "?"} GEL, ${photos.length} photos — ${labels}`);
    } else {
      await saveRejected(listing, summary);
      stats.rejected++;
      console.log(`${tag}: not renovated — ${labels}`);
    }
  }
  return stats;
}

async function detectDuplicates() {
  const listings = await getListingsForDuplicateDetection();
  console.log(`Duplicate detection: comparing ${listings.length} listings with more than 6 photos...`);
  const pairs = findDuplicatePairs(listings);
  const groups = pairsToGroups(pairs);
  await saveDuplicateGroups(groups);
  console.log(`Duplicate detection: ${pairs.length} duplicate pairs in ${groups.length} groups.`);
  return groups.length;
}

async function runOnce() {
  const started = Date.now();
  const removed = await removeSampleListings();
  if (removed) console.log(`Removed ${removed} old sample listings.`);

  console.log(`Collecting from myhome.ge: pages ${startPage}–${startPage + maxPages - 1}, up to ${maxListings} new/changed listings.`);
  const stats = await collectListings();
  const groups = await detectDuplicates();

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `Done in ${seconds}s. Seen ${stats.seen}, saved ${stats.saved} renovated, rejected ${stats.rejected}, ` +
      `unchanged ${stats.unchanged}, without photos ${stats.noPhotos}. Duplicate groups: ${groups}.`
  );
}

async function main() {
  await connect();
  console.log("Loading CLIP model (first run downloads ~600MB)...");
  await loadClip();

  await runOnce();
  if (intervalMinutes <= 0) return close();

  // Keep running: refresh listings N minutes after each run finishes (runs never overlap).
  const scheduleNext = () => {
    console.log(`Next run in ${intervalMinutes} minutes (PIPELINE_INTERVAL_MINUTES). Press Ctrl+C to stop.`);
    setTimeout(async () => {
      await runOnce().catch((err) => console.error("Pipeline run failed:", err.message || err));
      scheduleNext();
    }, intervalMinutes * 60 * 1000);
  };
  scheduleNext();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await close();
  process.exit(1);
});
