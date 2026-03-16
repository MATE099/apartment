/** Fetch apartment listings (sale, Tbilisi–Saburtalo) with pagination. */
import { config } from "../config/index.js";

const PARAMS = { deal_types: "1", real_estate_types: "1", cities: "1", urbans: "47", districts: "4", currency_id: "1", statuses: "2,3", area_types: "1" };
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", Accept: "application/json", Referer: "https://www.myhome.ge/", Origin: "https://www.myhome.ge" };

export function getHeaders() {
  try {
    const extra = process.env.TNET_EXTRA_HEADERS;
    return extra ? { ...HEADERS, ...JSON.parse(extra) } : HEADERS;
  } catch {
    return HEADERS;
  }
}

export async function fetchPage(page) {
  const url = `${config.apiBaseUrl}?${new URLSearchParams({ ...PARAMS, page: String(page) })}`;
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

function photoToUrl(p) {
  return typeof p === "string" ? p : (p?.url ?? p?.src ?? p?.link ?? null);
}

export function getItems(data) {
  return Array.isArray(data) ? data : data?.data ?? data?.statements ?? data?.items ?? data?.results ?? [];
}

export function toListing(item) {
  const id = item.id ?? item.statement_id ?? item.statementId ?? null;
  const raw = item.photos ?? item.images ?? item.gallery;
  const photoUrls = Array.isArray(raw) ? raw.map(photoToUrl).filter(Boolean) : (item.photo_url ? [item.photo_url] : item.image_url ? [item.image_url] : []);
  return { id, photoUrls, raw: item };
}

export async function* fetchAllListings() {
  for (let page = 1; ; page++) {
    const items = getItems(await fetchPage(page));
    if (items.length === 0) break;
    for (const item of items) yield toListing(item);
  }
}
