/** Download listing photos. Returns { url, buffer } for each success; failures are skipped. */

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Referer: "https://www.myhome.ge/",
};

export async function downloadImage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * @param {string[]} urls - Image URLs to download.
 * @param {{ concurrency?: number }} options - How many downloads run at the same time.
 */
export async function downloadListingPhotos(urls, { concurrency = 4 } = {}) {
  const results = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      const buffer = await downloadImage(urls[i]);
      if (buffer?.length) results[i] = { url: urls[i], buffer };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  // Keep the original photo order so results line up with the listing's photos.
  return results.filter(Boolean);
}
