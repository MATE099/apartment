/**
 * Test Step 6: fetch one listing → download photos → CLIP → renovated filter → save to DB.
 * Run: node src/test-step6.js
 * Requires: MongoDB running (npm run db:up).
 */
import { connect, saveListing, saveRejected, close } from "../db/index.js";
import { openSession, closeSession, fetchPage, toListing } from "./myhome-client.js";
import { downloadListingPhotos } from "./photo-download.js";
import { processPhotos } from "./clip.js";
import { isRenovated, summarizeLabels } from "./renovated-filter.js";

let session;
try {
  session = await openSession();
  const items = await fetchPage(session, 1);
  await closeSession(session);
  const listing = items.map(toListing).find((l) => l.photos.length);
  if (!listing) {
    console.log("No listing with photos on page 1.");
    process.exit(0);
  }

  console.log("Listing:", listing.externalId, listing.title, "|", listing.price, "GEL |", listing.photos.length, "photos");
  const photos = await downloadListingPhotos(listing.photos.map((p) => p.thumb));
  console.log("Downloaded:", photos.length);

  console.log("Running CLIP...");
  const clipResults = await processPhotos(photos);
  clipResults.forEach((r) => console.log(" ", r.label.padEnd(26), r.score.toFixed(2), r.url.split("/").pop()));
  const summary = summarizeLabels(clipResults);
  const pass = isRenovated(clipResults);
  console.log("Renovated filter:", pass ? "PASS" : "SKIP (too many excluded labels)", summary.counts);

  await connect();
  if (pass) await saveListing(listing, clipResults, summary);
  else await saveRejected(listing, summary);
  console.log("Saved to MongoDB.");
  await close();
} catch (err) {
  console.error(err);
  await closeSession(session);
  process.exit(1);
}
