/**
 * Test Step 6: fetch one listing → download photos → CLIP → renovated filter → save to DB.
 * Run: node src/test-step6.js
 * Requires: MongoDB running, .env with MONGODB_URI (optional).
 */
import { connect, saveListing, close } from "../db/index.js";
import { fetchPage, getItems, toListing } from "./api-client.js";
import { downloadListingPhotos } from "./photo-download.js";
import { processPhotos } from "./clip.js";
import { isRenovated } from "./renovated-filter.js";

try {
  const data = await fetchPage(1);
  const items = getItems(data);
  const listing = items.length ? toListing(items[0]) : null;
  if (!listing || !listing.photoUrls?.length) {
    console.log("No listing with photos on page 1.");
    process.exit(0);
  }

  console.log("Listing id:", listing.id, "Photos:", listing.photoUrls.length);
  const photos = await downloadListingPhotos(listing.photoUrls);
  console.log("Downloaded:", photos.length);
  if (!photos.length) {
    console.log("No photos downloaded.");
    process.exit(0);
  }

  console.log("Running CLIP...");
  const clipResults = await processPhotos(photos);
  const pass = isRenovated(clipResults);
  console.log("Renovated filter:", pass ? "PASS" : "SKIP (too many excluded labels)");

  if (pass) {
    await connect();
    await saveListing(listing, clipResults);
    console.log("Saved to MongoDB.");
    await close();
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
