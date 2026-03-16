/** Config from .env */
import "dotenv/config";

if (!process.env.TNET_API_URL) console.warn("TNET_API_URL not set.");
if (!process.env.MONGODB_URI) console.warn("MONGODB_URI not set.");

export const config = {
  apiBaseUrl: process.env.TNET_API_URL || "https://api-statements.tnet.ge/v1/statements",
  mongoDbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/apartment",
};
