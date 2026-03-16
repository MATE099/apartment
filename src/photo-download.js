/** Download photos for a listing. Returns { url, buffer } for each success; fails are skipped. */
import { getHeaders } from "./api-client.js";

export async function downloadImage(url) {
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function downloadListingPhotos(photoUrls, options = {}) {
  const out = [];
  for (const url of photoUrls) {
    const buffer = await downloadImage(url);
    if (buffer?.length) out.push({ url, buffer });
    else options.onFail?.(url);
  }
  return out;
}
