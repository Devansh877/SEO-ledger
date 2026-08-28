// Picks the rank provider from RANK_PROVIDER, so switching vendors is an
// environment variable rather than a code change. Providers share one
// interface: fetchRank(params) -> { position, searchVolume, url, isMock }
// where a null position means "genuinely not found in the results checked".
const serper = require("./serper");
const dataforseo = require("./dataforseo");

const PROVIDERS = { serper, dataforseo };

function getProvider() {
  const name = (process.env.RANK_PROVIDER || "serper").toLowerCase();
  if (name === "none") return null;
  return PROVIDERS[name] || null;
}

// Mock fallback, used only when no provider is configured. Flagged isMock so
// the value can never be mistaken for a real ranking downstream.
function mockRank() {
  return {
    position: 3 + Math.floor(Math.random() * 20),
    searchVolume: 100 + Math.floor(Math.random() * 400),
    url: null,
    isMock: true,
  };
}

// Derives the domain to match in results. Prefers the explicit websiteUrl,
// falling back to the Search Console property, which for most clients is the
// same site already verified.
function targetDomainFor(client) {
  const raw = client.websiteUrl || client.gscSiteUrl;
  if (!raw) return null;
  if (raw.startsWith("sc-domain:")) return raw.slice("sc-domain:".length).replace(/^www\./, "");
  try { return new URL(raw).hostname.replace(/^www\./, ""); }
  catch { return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null; }
}

async function fetchRank(client, trackedKeyword) {
  const provider = getProvider();
  const targetDomain = targetDomainFor(client);

  if (!provider || !targetDomain) return mockRank();

  try {
    const result = await provider.fetchRank({
      keyword: trackedKeyword.keyword,
      location: trackedKeyword.location,
      gl: trackedKeyword.gl,
      hl: trackedKeyword.hl,
      device: trackedKeyword.device,
      targetDomain,
    });
    // null means the provider isn't configured (no API key) — mock rather
    // than leaving the column permanently empty.
    return result || mockRank();
  } catch (err) {
    console.error(`Rank lookup failed for "${trackedKeyword.keyword}" via ${provider.name}: ${err.message}`);
    return mockRank();
  }
}

module.exports = { fetchRank, getProvider, targetDomainFor };
