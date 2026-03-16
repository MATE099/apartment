/**
 * Test Step 7+8: duplicate detection, then save groups to DB.
 * Run: node src/test-step7.js   (requires MongoDB with saved listings from step 6).
 */
import { connect, getListingsForDuplicateDetection, saveDuplicateGroups, close } from "../db/index.js";
import { findDuplicatePairs, pairsToGroups } from "./duplicate-detection.js";

try {
  await connect();
  const listings = await getListingsForDuplicateDetection();
  console.log("Listings with >6 photos (with embeddings):", listings.length);
  const pairs = findDuplicatePairs(listings);
  console.log("Duplicate pairs:", pairs.length);
  if (pairs.length) console.log(pairs);
  const groups = pairsToGroups(pairs);
  console.log("Duplicate groups:", groups.length);
  await saveDuplicateGroups(groups);
  console.log("Saved to duplicate_groups collection.");
  await close();
} catch (err) {
  console.error(err);
  process.exit(1);
}
