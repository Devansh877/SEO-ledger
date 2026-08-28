// DataForSEO — paid alternative to Serper. Worth switching to when search
// volume matters, since it is the one provider here that returns it.
//
// Two calls per keyword: the SERP for position, and Keywords Data for
// volume. Volume is not fetched when the SERP call finds nothing, since a
// keyword the client does not rank for at all does not need its volume
// priced.
const SERP_ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const VOLUME_ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

function authHeader() {
  const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = process.env;
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) return null;
  return "Basic " + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64");
}

async function post(url, auth, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify([body]),
  });
  if (!res.ok) {
    throw new Error(`DataForSEO ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const task = data.tasks?.[0];
  // DataForSEO returns HTTP 200 with a per-task error code, so the status
  // has to be checked inside the body rather than on the response.
  if (task?.status_code && task.status_code !== 20000) {
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message}`);
  }
  return task?.result?.[0];
}

async function fetchRank({ keyword, location, gl, hl, device, targetDomain }) {
  const auth = authHeader();
  if (!auth || !targetDomain) return null;

  const serp = await post(SERP_ENDPOINT, auth, {
    keyword,
    location_name: location,
    language_code: hl,
    device: device === "desktop" ? "desktop" : "mobile",
    depth: 100,
  });

  const items = (serp?.items || []).filter((i) => i.type === "organic");
  const hit = items.find((i) => (i.domain || "").replace(/^www\./, "").endsWith(targetDomain));

  let searchVolume = null;
  if (hit) {
    try {
      const vol = await post(VOLUME_ENDPOINT, auth, {
        keywords: [keyword],
        location_name: location,
        language_code: hl,
      });
      searchVolume = vol?.search_volume ?? null;
    } catch (err) {
      // Volume is supplementary — a failure here should not lose the rank.
      console.error(`DataForSEO volume lookup failed for "${keyword}": ${err.message}`);
    }
  }

  return {
    position: hit ? hit.rank_absolute : null,
    searchVolume,
    url: hit ? hit.url : null,
    isMock: false,
  };
}

module.exports = { fetchRank, name: "dataforseo", providesSearchVolume: true };
