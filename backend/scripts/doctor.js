// Diagnoses whether each client's GA4 / Search Console connection is
// actually real, or silently falling back to mock data. Makes real API
// calls (no writes — this never touches RankSnapshot/ReportSnapshot), and
// reports per client + per source. Run this instead of guessing from the
// dashboard, since a dashboard showing plausible-looking numbers can't by
// itself tell you whether they're real or mock.
//
//   npm run doctor
//
// Exit code 0: everything that's configured is working (or nothing is
//   configured yet, which isn't a failure, just an unfinished setup).
// Exit code 1: something that IS configured (has an env var + a property
//   ID set) failed when actually called — CI-friendly, and safe to fail a
//   deploy on.
require("dotenv").config();
const prisma = require("../src/lib/prisma");
const { getServiceAccountCredentials, getGoogleAuth } = require("../src/lib/googleAuth");

let hadFailure = false;

function ok(msg) { console.log(`  \u2713 ${msg}`); }
function warn(msg) { console.log(`  \u26a0 ${msg}`); }
function fail(msg) { console.log(`  \u2717 ${msg}`); hadFailure = true; }

async function checkEnv() {
  console.log("Environment variables\n");
  const required = ["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "CRON_SECRET", "FRONTEND_URL"];
  const optional = ["GA4_SERVICE_ACCOUNT_KEY_BASE64", "GSC_SERVICE_ACCOUNT_KEY_BASE64", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "GMB_OAUTH_CLIENT_ID", "GMB_OAUTH_CLIENT_SECRET"];

  for (const key of required) {
    if (process.env[key]) ok(key);
    else fail(`${key} is missing — the app will not run correctly without this`);
  }
  for (const key of optional) {
    if (process.env[key]) ok(`${key} (set)`);
    else warn(`${key} not set \u2014 that source stays on mock data`);
  }
  console.log("");
}

async function checkGa4(client) {
  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    warn("GA4: no service account configured \u2014 using mock data");
    return;
  }
  if (!client.ga4PropertyId) {
    warn(`GA4: ${client.name} has no ga4PropertyId set \u2014 using mock data`);
    return;
  }

  try {
    const { BetaAnalyticsDataClient } = require("@google-analytics/data");
    const analyticsClient = new BetaAnalyticsDataClient({ credentials });
    await analyticsClient.runReport({
      property: client.ga4PropertyId,
      dateRanges: [{ startDate: "yesterday", endDate: "today" }],
      metrics: [{ name: "activeUsers" }],
    });
    ok(`GA4: ${client.name} \u2014 real connection confirmed (${client.ga4PropertyId})`);
  } catch (err) {
    fail(`GA4: ${client.name} \u2014 real call failed: ${err.message.split("\n")[0]}`);
    console.log(`      Fix: add ${credentials.client_email} as Viewer on ${client.ga4PropertyId} (GA4 Admin -> Property Access Management)`);
  }
}

async function checkGsc(client) {
  const auth = getGoogleAuth();
  if (!auth) {
    warn("Search Console: no service account configured \u2014 using mock data");
    return;
  }
  if (!client.gscSiteUrl) {
    warn(`Search Console: ${client.name} has no gscSiteUrl set \u2014 using mock data`);
    return;
  }

  try {
    const authClient = await auth.getClient();
    const { token } = await authClient.getAccessToken();
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(client.gscSiteUrl)}/searchAnalytics/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: "2020-01-01", endDate: "2020-01-02", rowLimit: 1 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    ok(`Search Console: ${client.name} \u2014 real connection confirmed (${client.gscSiteUrl})`);
  } catch (err) {
    fail(`Search Console: ${client.name} \u2014 real call failed: ${err.message.split("\n")[0]}`);
    const credentials = getServiceAccountCredentials();
    console.log(`      Fix: add ${credentials.client_email} as a user on ${client.gscSiteUrl} (Search Console -> Settings -> Users and permissions)`);
  }
}

async function listVisibleGscSites() {
  const auth = getGoogleAuth();
  if (!auth) return;
  try {
    const authClient = await auth.getClient();
    const { token } = await authClient.getAccessToken();
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const sites = data.siteEntry || [];
    console.log(`Search Console properties this service account can see (${sites.length}):`);
    if (sites.length === 0) {
      console.log("  (none \u2014 the service account hasn't been added as a user on any property yet)");
    }
    sites.forEach((s) => console.log(`  - ${s.siteUrl} (${s.permissionLevel})`));
    console.log("  If a client's gscSiteUrl above doesn't match one of these exactly, that's almost always the misconfiguration.\n");
  } catch (err) {
    warn(`Couldn't list visible Search Console properties: ${err.message}\n`);
  }
}

async function main() {
  await checkEnv();

  let clients;
  try {
    clients = await prisma.client.findMany();
  } catch (err) {
    fail(`Could not reach the database: ${err.message.split("\n")[0]}`);
    console.log("  Check DATABASE_URL / DIRECT_URL in .env before anything else \u2014 nothing downstream can run without this.\n");
    console.log(`\n${hadFailure ? "FAILED \u2014 see \u2717 lines above" : "OK"}`);
    process.exit(1);
  }

  if (clients.length === 0) {
    warn("No clients in the database yet \u2014 run `npm run seed` first.\n");
  } else {
    console.log(`Checking ${clients.length} client(s)\n`);
    for (const client of clients) {
      console.log(`${client.name}:`);
      await checkGa4(client);
      await checkGsc(client);
      console.log("");
    }
  }

  await listVisibleGscSites();

  console.log("Not yet built (these always report mock data, regardless of env vars):");
  console.log("  - Google Business Profile (GMB-03) \u2014 no API client, no OAuth flow, gmb.service.js returns hardcoded numbers");
  console.log("  - DataForSEO (KWD-02 dataforseo source) \u2014 callDataForSeo() returns Math.random(), env vars are read by nothing");
  console.log("  - Conversions (CNV-04) \u2014 hardcoded events, does not call the GA4 client despite the README's original claim");

  console.log(`\n${hadFailure ? "FAILED \u2014 see \u2717 lines above" : "OK \u2014 no configured connection is failing"}`);
  process.exit(hadFailure ? 1 : 0);
}

main().catch((err) => {
  console.error("doctor crashed:", err);
  process.exit(1);
});
