// --------------------------------------------------------------------------
// Keyword ranking + search volume — location- and device-targeted, and
// tracked across three independent sources per keyword:
//   "dataforseo"     — paid SERP API, precise single-point rank, weekly cron
//   "search_console" — free, but an averaged/lagged number (see
//                       gsc.service.js) — weekly cron alongside DataForSEO
//   "manual"          — an admin actually checked and typed it in. Most
//                       accurate by definition, but only as fresh as
//                       someone last did it — expect roughly monthly, not
//                       weekly, and that's fine: it's not on the cron at
//                       all, it's a direct write whenever an admin submits
//                       one from Settings.
// Dashboards read all three side by side per tracked keyword rather than
// picking one "true" number, since each has a different accuracy/cost/
// freshness tradeoff and different agencies (or different clients within
// one agency) will weight that differently.
//
// Google localizes results by geography and device (a Melbourne search and
// a Sydney search can genuinely differ for the same term, and mobile vs
// desktop rankings frequently differ too), so a ranking is only meaningful
// alongside the location and device it was captured for.
//
// Simply appending "Melbourne" to a query string does NOT recreate a real
// local search — a browser search encodes the searcher's exact GPS/IP
// location as a Base64 "UULE" parameter, which is what actually forces
// Google to render the results page as if the searcher is physically
// standing there. Real API implementation point for the "dataforseo"
// source: DataForSEO's SERP + Keywords Data APIs
// (https://dataforseo.com/apis) — see callDataForSeo() below. Real params:
//   location_name: e.g. "Melbourne,Victoria,Australia" (or a more precise
//     location_code for suburb-level targeting) — SERP APIs convert this
//     canonical string into the correct UULE parameter behind the scenes.
//   gl: "au" (country)
//   hl: "en" (language)
//   device: "mobile" | "desktop"
// The API runs the search from a server actually geolocated there, logged
// out — a "clean SERP." It won't be pixel-identical to what one specific
// logged-in client sees in their own browser (a "dirty SERP," shaped by
// their personal search history and exact block-level proximity to local
// competitors) — see the note in Settings for how to explain that gap to a
// client. It does match what a neutral searcher in that location/device
// sees, which is the industry-standard, defensible definition of "your
// ranking."
//
// The app never calls a live ranking API from a dashboard request. Rank-
// tracking APIs only ever return *today's* position, so "previous vs
// current ranking" only exists because something snapshots it on a
// schedule — that's what pollRankingsForClient() does, called weekly by
// cron.routes.js (or on demand via the Settings page's "Refresh now"
// button). Dashboard reads (fetchKeywordReport) always come from our own
// RankSnapshot table, never from a live API call.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");

// Stand-in for a real DataForSEO call. Swap this function's body for:
//   POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced
//     body: { keyword, location_name: location, device, language_code: "en", gl: "au" }
//   POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live
//     body: { keywords: [keyword], location_name: location, language_code: "en" }
// keeping the same return shape ({ position, searchVolume }) so nothing
// else in this file has to change.
async function callDataForSeo(keyword, location, device) {
  const base = 3 + Math.floor(Math.random() * 20);
  return {
    position: base,
    searchVolume: 100 + Math.floor(Math.random() * 400),
  };
}

// Called by the weekly cron job, or manually from the admin Settings page.
// Writes one RankSnapshot row per tracked (keyword, location, device)
// combination for BOTH automated sources — DataForSEO and Search Console —
// since both run on the same cadence. Manual entries are never written
// here; see addManualRanking() below.
async function pollRankingsForClient(clientId) {
  const { pollSearchConsoleForClient } = require("./gsc.service"); // required here to avoid a require cycle
  const tracked = await prisma.trackedKeyword.findMany({ where: { clientId } });
  const results = [];
  for (const t of tracked) {
    const { position, searchVolume } = await callDataForSeo(t.keyword, t.location, t.device);
    const snap = await prisma.rankSnapshot.create({
      data: {
        clientId,
        keyword: t.keyword,
        location: t.location,
        device: t.device,
        source: "dataforseo",
        position,
        searchVolume,
      },
    });
    results.push(snap);
  }
  const gscResults = await pollSearchConsoleForClient(clientId);
  return [...results, ...gscResults];
}

// Called directly from the Settings page when an admin types in a ranking
// they checked by hand. Not on any schedule — this is a write, not a poll.
async function addManualRanking(clientId, trackedKeywordId, { position, searchVolume, note }) {
  const t = await prisma.trackedKeyword.findFirst({ where: { id: trackedKeywordId, clientId } });
  if (!t) throw new Error("Tracked keyword not found");

  return prisma.rankSnapshot.create({
    data: {
      clientId,
      keyword: t.keyword,
      location: t.location,
      device: t.device,
      source: "manual",
      position,
      searchVolume: searchVolume ?? null,
      note: note || null,
    },
  });
}

const SOURCES = ["dataforseo", "search_console", "manual"];

function summarizeSource(snapshots) {
  const chronological = [...snapshots].reverse();
  const current = snapshots[0] || null;
  const previous = snapshots[1] || null;
  return {
    position: current ? current.position : null,
    prevPosition: previous ? previous.position : null,
    searchVolume: current ? current.searchVolume : null,
    lastCapturedAt: current ? current.capturedAt : null,
    note: current ? current.note : null,
    history: chronological.map((s) => ({ date: s.capturedAt, position: s.position })),
  };
}

// Dashboard read: current position + recent history per tracked keyword,
// broken out by source (dataforseo / search_console / manual) rather than
// collapsed into one number — entirely from stored snapshots, no live API
// call.
async function fetchKeywordReport(client) {
  const tracked = await prisma.trackedKeyword.findMany({
    where: { clientId: client.id },
    orderBy: { keyword: "asc" },
  });

  const tracked_with_history = await Promise.all(
    tracked.map(async (t) => {
      const sources = {};
      for (const source of SOURCES) {
        const snapshots = await prisma.rankSnapshot.findMany({
          where: { clientId: client.id, keyword: t.keyword, location: t.location, device: t.device, source },
          orderBy: { capturedAt: "desc" },
          take: 12, // ~12 captures of history per source
        });
        sources[source] = summarizeSource(snapshots);
      }

      return {
        id: t.id,
        keyword: t.keyword,
        location: t.location,
        device: t.device,
        sources,
      };
    })
  );

  return { tracked: tracked_with_history };
}

module.exports = { fetchKeywordReport, pollRankingsForClient, addManualRanking };
