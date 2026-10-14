/**
 * Collects apartment listings from myhome.ge (for sale, Tbilisi–Saburtalo).
 *
 * myhome.ge sits behind Cloudflare and its statements API rejects direct calls (401),
 * so we open the real search page in Chrome and read each results page from the
 * site's own Next.js data endpoint (/_next/data/<buildId>/...json) inside that tab.
 */
import puppeteer from "puppeteer-core";
import { config } from "../config/index.js";

const { myhome } = config;
const CURRENCY = { GEL: "1", USD: "2", EUR: "3" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function searchUrl(page) {
  const params = new URLSearchParams({ ...myhome.searchQuery, ...(page > 1 ? { page: String(page) } : {}) });
  return `${myhome.baseUrl}${myhome.searchPath}?${params}`;
}

/** Opens Chrome on the search page and waits until Cloudflare lets us through. */
export async function openSession() {
  const browser = await puppeteer.launch({
    executablePath: myhome.chromePath,
    headless: myhome.headless,
    userDataDir: myhome.profileDir,
    defaultViewport: { width: 1100, height: 800 },
    args: ["--disable-blink-features=AutomationControlled", "--window-size=1100,800"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  const session = { browser, page, buildId: null, locale: "ka" };
  await loadSearchPage(session);
  return session;
}

async function loadSearchPage(session) {
  await session.page.goto(searchUrl(1), { waitUntil: "domcontentloaded", timeout: 60000 });
  // Up to 2 minutes: enough for Cloudflare's check, or for you to click its checkbox if it asks.
  for (let i = 0; i < 120; i++) {
    const info = await session.page
      .evaluate(() => (window.__NEXT_DATA__ ? { buildId: window.__NEXT_DATA__.buildId, locale: window.__NEXT_DATA__.locale } : null))
      .catch(() => null);
    if (info?.buildId) {
      session.buildId = info.buildId;
      session.locale = info.locale || "ka";
      return;
    }
    await sleep(1000);
  }
  throw new Error("myhome.ge did not load (Cloudflare check not passed). Try again, or solve the check in the Chrome window.");
}

export async function closeSession(session) {
  await session?.browser?.close().catch(() => {});
}

/** Returns the raw listing objects for one results page (24 per page, [] when past the end). */
export async function fetchPage(session, pageNumber) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const params = new URLSearchParams({ ...myhome.searchQuery, page: String(pageNumber) });
    const url = `/_next/data/${session.buildId}/${session.locale}${myhome.searchPath.replace(/\/$/, "")}.json?${params}`;
    const result = await session.page.evaluate(async (dataUrl) => {
      const res = await fetch(dataUrl, { headers: { "x-nextjs-data": "1" } });
      if (!res.ok) return { status: res.status };
      const json = await res.json();
      const queries = json?.pageProps?.dehydratedState?.queries || [];
      const list = queries.find((q) => q.queryKey?.[0] === "statements" && q.queryKey?.[1] === "list");
      return { status: res.status, items: list?.state?.data?.data?.data || [] };
    }, url);

    if (result.items) return result.items;
    // 404 usually means myhome.ge deployed a new build; reload the page to get the new buildId.
    if (attempt === 0) await loadSearchPage(session);
    else throw new Error(`myhome.ge page ${pageNumber} failed with HTTP ${result.status}`);
  }
  return [];
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converts a raw myhome.ge statement into the shape we store in MongoDB. */
export function toListing(item) {
  // price is keyed by currency id: { "1": GEL, "2": USD, "3": EUR }, each { price_total, price_square }
  const gel = item.price?.[CURRENCY.GEL] || {};
  const usd = item.price?.[CURRENCY.USD] || {};
  const photos = (item.images || [])
    .filter((img) => img?.large)
    .map((img) => ({ url: img.large, thumb: img.thumb || img.large }));
  const slug = item.dynamic_slug || "apartment";

  return {
    externalId: String(item.id),
    title: item.dynamic_title || null,
    price: positiveNumber(gel.price_total),
    priceCurrency: "GEL",
    pricePerSqm: positiveNumber(gel.price_square),
    priceUsd: positiveNumber(usd.price_total),
    pricePerSqmUsd: positiveNumber(usd.price_square),
    priceNegotiable: Boolean(item.price_negotiable),
    area_sqm: positiveNumber(item.area),
    rooms: positiveNumber(item.room),
    bedrooms: positiveNumber(item.bedroom),
    floor: Number.isFinite(Number(item.floor)) ? Number(item.floor) : null,
    total_floors: positiveNumber(item.total_floors),
    address: item.address || null,
    district: item.urban_name || null,
    districtGroup: item.district_name || null,
    city: item.city_name || null,
    description: item.comment || "",
    postedBy: item.user_title || null,
    sellerType: item.user_type?.type || null,
    lastUpdated: item.last_updated || null,
    sourceUrl: `${myhome.baseUrl}/udzravi-qoneba/${slug}-${item.id}/`,
    photos,
  };
}

/**
 * Yields listings page by page.
 * @param {{ startPage?: number, maxPages?: number }} options
 */
export async function* fetchAllListings({ startPage = 1, maxPages = 5 } = {}) {
  let session = await openSession();
  try {
    for (let page = startPage; page < startPage + maxPages; page++) {
      let items;
      try {
        items = await fetchPage(session, page);
      } catch (err) {
        // The Chrome window was closed or crashed: reopen it once and retry this page.
        console.log(`myhome.ge page ${page} failed (${err.message}), reopening Chrome...`);
        await closeSession(session);
        session = await openSession();
        items = await fetchPage(session, page);
      }
      console.log(`myhome.ge page ${page}: ${items.length} listings`);
      if (items.length === 0) break;
      for (const item of items) yield toListing(item);
      await sleep(myhome.pageDelayMs);
    }
  } finally {
    await closeSession(session);
  }
}
