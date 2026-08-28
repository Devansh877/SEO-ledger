// --------------------------------------------------------------------------
// Conversions (CNV-04) — GA4 key events, captured weekly alongside GA4-01.
//
// Kept as its own module rather than folded into the GA4 report because it
// is granted independently in the access ledger: a client can be shown
// traffic without conversion counts, or the reverse.
//
// "Key events" is GA4's current name for what used to be called
// conversions. The keyEvents metric counts only events the property owner
// has actually marked as key, which is what makes this meaningful — an
// unmarked event is just traffic, and reporting every event as a conversion
// would inflate the number badly.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");
const { resolveAuthForClient } = require("../lib/googleAuth");

// Same Monday-to-Saturday window GA4-01 uses, so the two modules in one
// capture always describe the same week.
function getCompletedWeekRange(refDate = new Date()) {
  const d = new Date(refDate);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 1));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 5);
  return { startDate: start, endDate: end };
}
const fmt = (d) => d.toISOString().slice(0, 10);
function shiftDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function buildMockPayload() {
  const { startDate, endDate } = getCompletedWeekRange();
  return {
    isMock: true,
    week: { startDate: fmt(startDate), endDate: fmt(endDate) },
    totalConversions: 27,
    deltaPct: 0,
    events: [
      { name: "Thank you", count: 21, pctOfTotal: 77.8 },
      { name: "Call Click", count: 4, pctOfTotal: 14.8 },
      { name: "Email Click", count: 2, pctOfTotal: 7.4 },
    ],
  };
}

async function fetchRealConversions(client, startDate, endDate) {
  if (!client.ga4PropertyId) return null;

  const auth = await resolveAuthForClient(client.id);
  if (!auth) return null;

  const { BetaAnalyticsDataClient } = require("@google-analytics/data");
  const analytics = new BetaAnalyticsDataClient(
    auth.mode === "oauth" ? { authClient: auth.authClient } : { credentials: auth.credentials }
  );

  const range = { startDate: fmt(startDate), endDate: fmt(endDate) };
  const prevRange = { startDate: fmt(shiftDays(startDate, -7)), endDate: fmt(shiftDays(endDate, -7)) };

  // Per key-event breakdown for the reported week.
  const [byEvent] = await analytics.runReport({
    property: client.ga4PropertyId,
    dateRanges: [range],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "keyEvents" }],
    orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
    limit: 25,
  });

  const events = (byEvent.rows || [])
    .map((r) => ({ name: r.dimensionValues[0].value, count: parseFloat(r.metricValues[0].value) }))
    // GA4 returns every event name with a zero for those not marked as key
    // events. Dropping zeros leaves only real conversions.
    .filter((e) => e.count > 0);

  const total = events.reduce((sum, e) => sum + e.count, 0);

  // Week-over-week on the total, in one call with two ranges.
  const [totals] = await analytics.runReport({
    property: client.ga4PropertyId,
    dateRanges: [range, prevRange],
    metrics: [{ name: "keyEvents" }],
  });
  const current = parseFloat(totals.rows?.[0]?.metricValues?.[0]?.value || "0");
  const previous = parseFloat(totals.rows?.[1]?.metricValues?.[0]?.value || "0");

  return {
    isMock: false,
    week: { startDate: fmt(startDate), endDate: fmt(endDate) },
    totalConversions: current,
    deltaPct: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : 0,
    events: events.map((e) => ({
      ...e,
      pctOfTotal: total ? Math.round((e.count / total) * 1000) / 10 : 0,
    })),
    // Distinguishes "connected, and this client genuinely had no conversions
    // this week" from "not configured". Without it a real zero looks broken.
    noKeyEventsConfigured: events.length === 0,
  };
}

async function pollConversionsForClient(client) {
  const { startDate, endDate } = getCompletedWeekRange();
  let payload;
  try {
    payload = await fetchRealConversions(client, startDate, endDate);
  } catch (err) {
    console.error(`Conversions real API call failed for client ${client.id} (${client.name}), falling back to mock:`, err.message);
    payload = null;
  }
  if (!payload) payload = buildMockPayload();

  return prisma.reportSnapshot.create({
    data: { clientId: client.id, module: "CNV-04", payload },
  });
}

async function getLatestConversionsReport(clientId) {
  const snap = await prisma.reportSnapshot.findFirst({
    where: { clientId, module: "CNV-04" },
    orderBy: { capturedAt: "desc" },
  });
  if (!snap) return null;
  return { ...snap.payload, capturedAt: snap.capturedAt };
}

module.exports = { pollConversionsForClient, getLatestConversionsReport };
