/**
 * Step 9: Main pipeline. Fetch → download → CLIP → filter renovated → save → duplicate detection → store duplicates.
 * Run: npm start   (or node src/pipeline.js)
 * Limit: processes up to PIPELINE_MAX_LISTINGS (env or default 5) so a run finishes in reasonable time.
 */
import { connect, close, saveListing, getListingsForDuplicateDetection, saveDuplicateGroups } from "../db/index.js";
import { fetchAllListings } from "./api-client.js";
import { downloadListingPhotos } from "./photo-download.js";
import { processPhotos } from "./clip.js";
import { isRenovated } from "./renovated-filter.js";
import { findDuplicatePairs, pairsToGroups } from "./duplicate-detection.js";
import { loadClip } from "./clip.js";

const MAX_LISTINGS = parseInt(process.env.PIPELINE_MAX_LISTINGS || "5", 10);

async function run() {
  console.log("Pipeline: connecting to DB...");
  await connect();
  console.log("Pipeline: loading CLIP (once)...");
  await loadClip();

  let processed = 0;
  let saved = 0;
  for await (const listing of fetchAllListings()) {
    if (processed >= MAX_LISTINGS) break;
    if (!listing.photoUrls?.length) continue;

    processed++;
    console.log(`[${processed}/${MAX_LISTINGS}] Listing ${listing.id}, ${listing.photoUrls.length} photos`);

    const photos = await downloadListingPhotos(listing.photoUrls);
    if (!photos.length) continue;

    const clipResults = await processPhotos(photos);
    if (!isRenovated(clipResults)) continue;

    await saveListing(listing, clipResults);
    saved++;
    console.log(`  -> saved (renovated)`);
  }

  console.log("Pipeline: duplicate detection...");
  const listings = await getListingsForDuplicateDetection();
  const pairs = findDuplicatePairs(listings);
  const groups = pairsToGroups(pairs);
  await saveDuplicateGroups(groups);
  console.log("Pipeline: duplicate groups saved:", groups.length);

  await close();
  console.log("Done. Processed", processed, "listings, saved", saved, "renovated. Duplicate groups:", groups.length);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
