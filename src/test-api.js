/** Fetch page 1 and log the response. Run: node src/test-api.js */
import { fetchPage } from "./api-client.js";

try {
  const data = await fetchPage(1);
  console.log("Response keys:", Object.keys(data));
  console.log("First item:", data?.data?.[0] ?? data?.statements?.[0] ?? data?.[0] ?? "(none)");
} catch (err) {
  console.error(err);
  process.exit(1);
}
