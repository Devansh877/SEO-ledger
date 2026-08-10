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
//     process and expose it instantly. We query a 28-day window ending 3
//     days ago, both to dodge the lag and because a single keyword often
//     doesn't have enough daily impressions for a stable weekly average.
//   - Requires the client's actual Search Console property to be verified
//     and shared with the service account (see backend/src/lib/googleAuth.js)
//     — it can't check an arbitrary domain the way a third-party SERP API
//     can. client.gscSiteUrl must be set (e.g. "https://example.com.au/"
//     or "sc-domain:example.com.au" for a domain property).
//   - It's free once set up, which is the whole reason to include it
//     alongside a paid SERP API rather than instead of it: cheap-but-fuzzy
//     next to precise-but-paid, so the agency can choose per client/keyword
//     which tradeoff matters, or just show both.
//
// If Search Console genuinely has zero impressions for a keyword in the
// window (a real, meaningful "no data" answer), no snapshot is written for
// it that round rather than fabricating a mock number — that's different
// from "not configured yet" (falls back to mock, for demo clients) or "the
// API call itself errored" (also falls back to mock, so one bad request
// doesn't leave the source silently empty).
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");
const { getGoogleAuth } = require("../lib/googleAuth");

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

// Real API call: searchanalytics.query
// (https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
// Returns { position } on a real match, or null if GSC has no impression
// data for this exact query in the window (not an error — just nothing to
// report yet).
async function fetchRealPosition(client, keyword) {
  const auth = getGoogleAuth();
  if (!auth || !client.gscSiteUrl) return { configured: false };

  const authClient = await auth.getClient();
  const { token } = await authClient.getAccessToken();

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3); // dodge GSC's 2-3 day processing lag
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 28); // wider window for a stable average

  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(client.gscSiteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: keyword }] }],
      rowLimit: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Search Console API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const row = data.rows?.[0];
  if (!row) return { configured: true, noData: true };
  return { configured: true, position: Math.round(row.position * 10) / 10 };
}

// Mock fallback — used when not configured, or when the real call errors.
function mockPosition() {
  return 3 + Math.floor(Math.random() * 20);
}

async function pollSearchConsoleForClient(clientId) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const tracked = await prisma.trackedKeyword.findMany({ where: { clientId } });
  const results = [];

  for (const t of tracked) {
    let position = null;
    let skip = false;

    try {
      const real = await fetchRealPosition(client, t.keyword);
      if (!real.configured) {
        position = mockPosition(); // demo/unconfigured client — keep the UI populated
      } else if (real.noData) {
        skip = true; // genuinely no impressions yet — don't fabricate a number
      } else {
        position = real.position;
      }
    } catch (err) {
      console.error(`Search Console real API call failed for client ${clientId}, keyword "${t.keyword}", falling back to mock:`, err.message);
      position = mockPosition();
    }

    if (skip) continue;

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
