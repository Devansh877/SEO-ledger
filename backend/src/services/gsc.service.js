// --------------------------------------------------------------------------
// Google Search Console — free, but structurally different from a SERP API
// like DataForSEO, not a drop-in substitute:
//
//   - GSC's Search Analytics API returns an *average* position across every
//     impression in the date range, not a single point-in-time rank. If a
//     keyword ranked #3 on Monday and #7 on Friday, GSC reports something
//     like "5.0" for the week — a real number, but not "where do I rank
//     right now" the way a SERP API answers it.
//   - Data typically lags 2-3 days behind real time — Google doesn't
//     process and expose it instantly.
//   - Requires the client's actual GA4/Search Console property to be
//     verified and shared with a service account (similar setup to the GA4
//     Data API integration) — it can't check an arbitrary domain the way a
//     third-party SERP API can.
//   - It's free once set up, which is the whole reason to include it
//     alongside a paid SERP API rather than instead of it: cheap-but-fuzzy
//     next to precise-but-paid, so the agency can choose per client/keyword
//     which tradeoff matters, or just show both.
//
// Real API implementation point: pollSearchConsoleForClient() is where
// searchanalytics.query (https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
// would go — dimensions: ["query"], filtered to the tracked keyword,
// dimensionFilterGroups scoped to country if you want geo granularity
// (GSC's country filter is coarse — country-level, not city-level like a
// SERP API's location targeting, which is the other reason it can't fully
// replace DataForSEO for city-specific tracking).
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");

async function callSearchConsole(keyword) {
  // Mock: a plausible averaged position, usually a bit noisier/rounder
  // than a precise SERP check since it's an average across many searches.
  const avgPosition = 3 + Math.floor(Math.random() * 20);
  return { position: avgPosition };
}

async function pollSearchConsoleForClient(clientId) {
  const tracked = await prisma.trackedKeyword.findMany({ where: { clientId } });
  const results = [];
  for (const t of tracked) {
    const { position } = await callSearchConsole(t.keyword);
    const snap = await prisma.rankSnapshot.create({
      data: {
        clientId,
        keyword: t.keyword,
        location: t.location,
        device: t.device,
        source: "search_console",
        position,
        searchVolume: null, // GSC doesn't report search volume, only clicks/impressions
      },
    });
    results.push(snap);
  }
  return results;
}

module.exports = { pollSearchConsoleForClient };
