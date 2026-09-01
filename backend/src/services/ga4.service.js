// --------------------------------------------------------------------------
// GA4 Data API — captured every Sunday, covering the just-completed week
// (Monday through Saturday), not called live from a dashboard load.
//
// Real API call: fetchRealGa4Payload() below, using the GA4 Data API
// (analyticsdata.googleapis.com via the @google-analytics/data client
// library) with the service account configured in
// GA4_SERVICE_ACCOUNT_KEY_BASE64 — see backend/src/lib/googleAuth.js.
// Requires that service account's email to be added as Viewer on the
// client's actual GA4 property (Admin -> Property Access Management), and
// requires client.ga4PropertyId to be set (e.g. "properties/123456789").
//
// If either isn't configured yet, this falls back to mock data rather than
// erroring — so demo clients (and any client mid-onboarding, before their
// GA4 property is wired up) keep working. A real call that's attempted but
// fails (wrong property ID, access not granted yet, etc.) also falls back
// to mock rather than crashing the whole weekly poll for every other
// client — the error is logged so it's visible, not swallowed silently.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");
const { getServiceAccountCredentials } = require("../lib/googleAuth");

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Given the day the poll runs (normally a Sunday, via cron), returns the
// most recently completed Monday-Saturday range. Works no matter which day
// it's actually called on (e.g. a manual "Refresh now" mid-week still
// reports the last full week, not a partial one).
function getCompletedWeekRange(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToSat = day + 1; // Sunday->1, Monday->2, ... Saturday->7
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() - diffToSat);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 5); // Monday, 5 days before that Saturday
  return { startDate: start, endDate: end };
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}
function shiftDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// --- Mock path (default, and the fallback if the real call fails) ---

function buildDailyBreakdownMock(startDate) {
  return WEEKDAY_LABELS.map((label, i) => {
    const date = shiftDays(startDate, i);
    return {
      date: fmt(date),
      label,
      users: 15 + Math.floor(Math.random() * 40),
      sessions: 20 + Math.floor(Math.random() * 50),
    };
  });
}

function buildMockPayload() {
  const { startDate, endDate } = getCompletedWeekRange();
  return {
    week: { startDate: fmt(startDate), endDate: fmt(endDate) },
    summary: {
      totalUsers: { value: 330, deltaPct: 7.1 },
      newUsers: { value: 300, deltaPct: 2.0 },
      engagedSessions: { value: 306, deltaPct: -30.6 },
      avgSessionDuration: { value: "00:04:01" },
      bounceRate: { value: 48.1, deltaPct: 23.4 },
      sessionKeyEventRate: { value: 4.41, deltaPct: -11.5 },
    },
    dailyBreakdown: buildDailyBreakdownMock(startDate),
    topEvents: [
      { name: "page_view", count: 1168, pctEvents: 37.1 },
      { name: "user_engagement", count: 817, pctEvents: 25.9 },
      { name: "session_start", count: 590, pctEvents: 18.7 },
      { name: "first_visit", count: 300, pctEvents: 9.5 },
      { name: "scroll", count: 176, pctEvents: 5.6 },
      { name: "form_start", count: 22, pctEvents: 0.7 },
      { name: "Thank you", count: 21, pctEvents: 0.7 },
      { name: "click", count: 21, pctEvents: 0.7 },
      { name: "CTA Button Click", count: 17, pctEvents: 0.5 },
    ],
    landingPages: [
      { path: "/", sessions: 246, pctSessions: 42, bounceRate: 31.3 },
      { path: "/about-us-cyberforte/", sessions: 65, pctSessions: 11, bounceRate: 75.4 },
      { path: "(not set)", sessions: 64, pctSessions: 11, bounceRate: 100.0 },
      { path: "/contact-us-cyberforte/", sessions: 21, pctSessions: 4, bounceRate: 38.1 },
      { path: "/iso-27001-certification/", sessions: 16, pctSessions: 3, bounceRate: 18.8 },
    ],
    trafficSource: [
      { name: "Direct", pct: 50.9 },
      { name: "Organic Search", pct: 43.3 },
      { name: "Referral", pct: 2.4 },
      { name: "Organic Social", pct: 1.8 },
      { name: "AI Assistant", pct: 1.1 },
      { name: "Unassigned", pct: 0.5 },
    ],
  };
}

// --- Real path ---

function deltaPct(current, previous) {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

async function fetchRealGa4Payload(client, startDate, endDate) {
  const credentials = getServiceAccountCredentials();
  if (!credentials || !client.ga4PropertyId) return null; // not configured — caller falls back to mock

  const { BetaAnalyticsDataClient } = require("@google-analytics/data");
  const analyticsClient = new BetaAnalyticsDataClient({ credentials });
  const property = client.ga4PropertyId;
  const range = { startDate: fmt(startDate), endDate: fmt(endDate) };
  const prevRange = { startDate: fmt(shiftDays(startDate, -7)), endDate: fmt(shiftDays(endDate, -7)) };

  // Summary: two date ranges in one call (this week + the prior week) so
  // GA4 returns both sets of metric totals for the delta% calculation —
  // with no dimensions requested, GA4 returns exactly one row per range.
  const [summaryRes] = await analyticsClient.runReport({
    property,
    dateRanges: [range, prevRange],
    metrics: [
      { name: "totalUsers" }, { name: "newUsers" }, { name: "engagedSessions" },
      { name: "averageSessionDuration" }, { name: "bounceRate" }, { name: "sessionKeyEventRate" },
    ],
  });
  const curRow = summaryRes.rows?.[0]?.metricValues || [];
  const prevRow = summaryRes.rows?.[1]?.metricValues || [];
  const num = (row, i) => parseFloat(row[i]?.value || "0");

  const [dailyRes] = await analyticsClient.runReport({
    property,
    dateRanges: [range],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  const [eventsRes] = await analyticsClient.runReport({
    property,
    dateRanges: [range],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 9,
  });
  const totalEventCount = eventsRes.rows?.reduce((s, r) => s + parseFloat(r.metricValues[0].value), 0) || 1;

  const [landingRes] = await analyticsClient.runReport({
    property,
    dateRanges: [range],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }, { name: "bounceRate" }],
    orderBys: [{ metric: { metricName: "sessions" } , desc: true }],
    limit: 5,
  });
  const totalSessions = landingRes.rows?.reduce((s, r) => s + parseFloat(r.metricValues[0].value), 0) || 1;

  const [trafficRes] = await analyticsClient.runReport({
    property,
    dateRanges: [range],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });
  const trafficTotal = trafficRes.rows?.reduce((s, r) => s + parseFloat(r.metricValues[0].value), 0) || 1;

  return {
    week: { startDate: fmt(startDate), endDate: fmt(endDate) },
    summary: {
      totalUsers: { value: num(curRow, 0), deltaPct: deltaPct(num(curRow, 0), num(prevRow, 0)) },
      newUsers: { value: num(curRow, 1), deltaPct: deltaPct(num(curRow, 1), num(prevRow, 1)) },
      engagedSessions: { value: num(curRow, 2), deltaPct: deltaPct(num(curRow, 2), num(prevRow, 2)) },
      avgSessionDuration: { value: formatDuration(num(curRow, 3)) },
      bounceRate: { value: Math.round(num(curRow, 4) * 1000) / 10, deltaPct: deltaPct(num(curRow, 4), num(prevRow, 4)) },
      sessionKeyEventRate: { value: Math.round(num(curRow, 5) * 1000) / 10, deltaPct: deltaPct(num(curRow, 5), num(prevRow, 5)) },
    },
    dailyBreakdown: (dailyRes.rows || []).map((r, i) => {
      const dateStr = r.dimensionValues[0].value; // "YYYYMMDD"
      return {
        date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
        label: WEEKDAY_LABELS[i] || "",
        users: parseFloat(r.metricValues[0].value),
        sessions: parseFloat(r.metricValues[1].value),
      };
    }),
    topEvents: (eventsRes.rows || []).map((r) => {
      const count = parseFloat(r.metricValues[0].value);
      return {
        name: r.dimensionValues[0].value,
        count,
        pctEvents: Math.round((count / totalEventCount) * 1000) / 10,
      };
    }),
    landingPages: (landingRes.rows || []).map((r) => {
      const sessions = parseFloat(r.metricValues[0].value);
      return {
        path: r.dimensionValues[0].value,
        sessions,
        pctSessions: Math.round((sessions / totalSessions) * 100),
        bounceRate: Math.round(parseFloat(r.metricValues[1].value) * 1000) / 10,
      };
    }),
    trafficSource: (trafficRes.rows || []).map((r) => ({
      name: r.dimensionValues[0].value,
      pct: Math.round((parseFloat(r.metricValues[0].value) / trafficTotal) * 1000) / 10,
    })),
  };
}

// Called by the weekly Sunday cron job, or the Settings page's manual
// refresh — either way, this is the only place GA4 data is ever fetched.
async function pollGa4ForClient(client) {
  const { startDate, endDate } = getCompletedWeekRange();
  let payload;
  try {
    payload = await fetchRealGa4Payload(client, startDate, endDate);
  } catch (err) {
    console.error(`GA4 real API call failed for client ${client.id} (${client.name}), falling back to mock:`, err.message);
    payload = null;
  }
  if (!payload) payload = buildMockPayload();

  return prisma.reportSnapshot.create({
    data: { clientId: client.id, module: "GA4-01", payload },
  });
}

// Dashboard read: most recent capture, or null if nothing's been captured
// yet (e.g. a client onboarded between one Sunday cycle and the next).
async function getLatestGa4Report(clientId) {
  const snap = await prisma.reportSnapshot.findFirst({
    where: { clientId, module: "GA4-01" },
    orderBy: { capturedAt: "desc" },
  });
  if (!snap) return null;
  return { ...snap.payload, capturedAt: snap.capturedAt };
}

module.exports = { pollGa4ForClient, getLatestGa4Report };
