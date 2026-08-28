// Serper (https://serper.dev) — the default rank provider.
//
// Chosen as the default on cost: 2,500 free credits covers roughly ten
// clients at twenty keywords on a weekly cadence at no charge, and paid
// tiers run around $0.30-1.00 per 1,000 searches. DataForSEO is comparable
// at $0.60/1k; SerpApi is roughly 40x that.
//
// What it does NOT return: search volume. Serper is a SERP scraper, not a
// keyword research tool, so searchVolume comes back null and the dashboard
// shows a blank rather than a fabricated number. DataForSEO's Keywords Data
// API does provide it — see dataforseo.js — which is the main reason to pay
// for it once volume actually matters to your reporting.
const ENDPOINT = "https://google.serper.dev/search";

// Serper's `location` takes a canonical place string ("Melbourne, Victoria,
// Australia") and encodes it into Google's UULE parameter internally, which
// is what actually pins the simulated searcher's position. Appending a city
// to the query string does not do this and produces a different SERP.
async function fetchRank({ keyword, location, gl, hl, device, targetDomain }) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  if (!targetDomain) return null;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: keyword,
      location,
      gl,
      hl,
      // 100 results so a keyword sitting deep still gets a real position
      // rather than being reported as "not in top 10". Serper bills two
      // credits above 10 results, which is the tradeoff being made here.
      num: 100,
      ...(device === "desktop" ? {} : { device: "mobile" }),
    }),
  });

  if (!res.ok) {
    throw new Error(`Serper ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }

  const data = await res.json();
  const organic = data.organic || [];

  const hit = organic.find((r) => {
    try { return new URL(r.link).hostname.replace(/^www\./, "").endsWith(targetDomain); }
    catch { return false; }
  });

  return {
    // null position is meaningful: the domain genuinely did not appear in
    // the first 100 results. The caller skips writing a snapshot rather
    // than recording a fake "100".
    position: hit ? hit.position : null,
    searchVolume: null,
    url: hit ? hit.link : null,
    isMock: false,
  };
}

module.exports = { fetchRank, name: "serper", providesSearchVolume: false };
