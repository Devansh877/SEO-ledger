// --------------------------------------------------------------------------
// Keyword ranking + search volume — location- and device-targeted, and
// tracked across three independent sources per keyword:
//   "serp"           — SERP API (Serper by default, DataForSEO optional),
//                       precise single-point rank, weekly cron
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

// Captures one snapshot per tracked keyword from the configured SERP
// provider (see services/rank/). Which vendor that is comes from
// RANK_PROVIDER — the stored source is always "serp" so history stays
// continuous if you switch providers, rather than splitting into two
// unrelated series.
async function pollRankingsForClient(clientId) {
  const { pollSearchConsoleForClient } = require("./gsc.service"); // required here to avoid a require cycle
  const { fetchRank } = require("./rank");

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const tracked = await prisma.trackedKeyword.findMany({ where: { clientId } });
  const results = [];

  for (const t of tracked) {
    const { position, searchVolume, isMock } = await fetchRank(client, t);

    // A null position means the domain genuinely wasn't in the results
    // checked. Recording it as 100 would be a lie that shows up as a real
    // ranking on the dashboard, and recording 0 would break the "lower is
    // better" ordering, so no snapshot is written this round.
    if (position === null || position === undefined) {
      console.log(`No ranking found for "${t.keyword}" (${client.name}) — not in the results checked`);
      continue;
    }

    results.push(await prisma.rankSnapshot.create({
      data: {
        clientId,
        keyword: t.keyword,
        location: t.location,
        device: t.device,
        source: "serp",
        position,
        searchVolume: searchVolume ?? null,
        note: isMock ? "MOCK DATA — no rank provider configured" : null,
      },
    }));
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

const SOURCES = ["serp", "search_console", "manual"];

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
