// --------------------------------------------------------------------------
// GA4 Data API — captured every Sunday, covering the just-completed week
// (Monday through Saturday), not called live from a dashboard load.
//
// Real API implementation point: pollGa4ForClient() is where a Google
// service account (added as Viewer on the client's GA4 property) would call
// analyticsdata.googleapis.com:runReport with dateRanges spanning the same
// Monday-Saturday window computed below, requesting a daily breakdown
// (dimension: "date"). Everything else — the weekly cron, the manual
// refresh button, the dashboard reading getLatestGa4Report() — stays the
// same either way.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");

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

function buildDailyBreakdown(startDate) {
  // Mock daily users for each of the 6 days (Mon-Sat) just completed.
  return WEEKDAY_LABELS.map((label, i) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + i);
    return {
      date: date.toISOString().slice(0, 10),
      label,
      users: 15 + Math.floor(Math.random() * 40),
      sessions: 20 + Math.floor(Math.random() * 50),
    };
  });
}

function buildMockPayload() {
  const { startDate, endDate } = getCompletedWeekRange();
  return {
    week: { startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) },
    summary: {
      totalUsers: { value: 330, deltaPct: 7.1 },
      newUsers: { value: 300, deltaPct: 2.0 },
      engagedSessions: { value: 306, deltaPct: -30.6 },
      avgSessionDuration: { value: "00:04:01" },
      bounceRate: { value: 48.1, deltaPct: 23.4 },
      sessionKeyEventRate: { value: 4.41, deltaPct: -11.5 },
    },
    dailyBreakdown: buildDailyBreakdown(startDate),
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

// Called by the weekly Sunday cron job, or the Settings page's manual
// refresh — either way, this is the only place GA4 data is ever fetched.
async function pollGa4ForClient(client) {
  const payload = buildMockPayload(client);
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
