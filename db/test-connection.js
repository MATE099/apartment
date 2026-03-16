/**
 * Test MongoDB connection. Run with: node db/test-connection.js
 * Requires MongoDB running and MONGODB_URI in .env (or default localhost).
 */
import { connect, getListingsCollection, close } from "./index.js";

async function main() {
  await connect();
  const listings = getListingsCollection();
  const count = await listings.countDocuments();
  console.log("Connected. Listings count:", count);
  await close();
  console.log("Closed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
