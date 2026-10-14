/** Fetch page 1 from myhome.ge and print the first listing. Run: npm run test:api */
import { openSession, closeSession, fetchPage, toListing } from "./myhome-client.js";

let session;
try {
  session = await openSession();
  const items = await fetchPage(session, 1);
  console.log("Listings on page 1:", items.length);
  if (items[0]) {
    const { photos, description, ...listing } = toListing(items[0]);
    console.log(listing);
    console.log("Photos:", photos.length, photos[0]);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await closeSession(session);
}
