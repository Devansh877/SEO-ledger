// Connection diagnostics. Answers one question per integration: is this
// actually talking to Google, or is it quietly serving mock data?
//
//   npm run doctor
//
// This matters because every service in this app falls back to mock data
// when a credential is missing or an API call fails, and it does so
// silently as far as the dashboard is concerned — the stored payload looks
// identical either way. This script makes the real API calls directly and
// reports what happened, so "the dashboard has numbers in it" is never
// mistaken for "the integration works".
require("dotenv").config();
const prisma = require("../lib/prisma");
const { getServiceAccountCredentials, getGoogleAuth } = require("../lib/googleAuth");

const results = [];
function record(area, name, status, detail) {
  results.push({ area, name, status, detail });
}

// ---------------------------------------------------------------- core env

function checkEnv() {
  const dbUrl = process.env.DATABASE_URL;
  record("Core", "DATABASE_URL", dbUrl ? "PASS" : "FAIL",
    dbUrl ? dbUrl.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@") : "not set — nothing will work without it");

  record("Core", "DIRECT_URL", process.env.DIRECT_URL ? "PASS" : "WARN",
    process.env.DIRECT_URL ? "set" : "not set — `prisma migrate` needs this, the running app does not");

  const jwt = process.env.JWT_SECRET;
  if (!jwt) {
    record("Core", "JWT_SECRET", "FAIL", "not set — lib/jwt.js falls back to 'dev-secret-change-me', which anyone can use to forge an admin token");
  } else if (jwt === "dev-secret-change-me" || jwt.length < 32) {
    record("Core", "JWT_SECRET", "FAIL", "set but weak or still the dev default — generate a new one: openssl rand -base64 48");
  } else {
    record("Core", "JWT_SECRET", "PASS", `${jwt.length} chars`);
  }

  record("Core", "CRON_SECRET", process.env.CRON_SECRET ? "PASS" : "FAIL",
    process.env.CRON_SECRET ? "set — /cron/poll-all is protected" : "not set — /cron/poll-all rejects every request, so the weekly capture will never run");

  const frontend = process.env.FRONTEND_URL;
  record("Core", "FRONTEND_URL", frontend ? "PASS" : "WARN",
    frontend ? frontend : "not set — CORS falls open to '*'");
}

// ------------------------------------------------------------------ database

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [clients, users, keywords, ranks, reports] = await Promise.all([
      prisma.client.count(), prisma.user.count(), prisma.trackedKeyword.count(),
      prisma.rankSnapshot.count(), prisma.reportSnapshot.count(),
    ]);
    record("Database", "Connection", "PASS",
      `${clients} clients, ${users} users, ${keywords} tracked keywords, ${ranks} rank snapshots, ${reports} report snapshots`);
    return true;
  } catch (err) {
    record("Database", "Connection", "FAIL", err.message);
    return false;
  }
}

// ------------------------------------------------------------ service account

function checkServiceAccount() {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    record("Google", "Service account", "FAIL",
      "GA4_SERVICE_ACCOUNT_KEY_BASE64 not set (or not valid base64 JSON) — GA4 and Search Console will both serve mock data");
    return null;
  }
  record("Google", "Service account", "PASS", creds.client_email);
  return creds;
}

// ------------------------------------------------------------- search console

// Lists the properties this service account can actually see. This is the
// single most useful check here: if a client's site isn't in this list, the
// service account hasn't been added to it in Search Console, and no amount
// of correcting gscSiteUrl will help.
async function checkSearchConsoleAccess() {
  const auth = getGoogleAuth();
  if (!auth) return null;

  try {
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      record("Search Console", "Visible properties", "FAIL", `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const sites = (data.siteEntry || []).map((s) => s.siteUrl);
    if (!sites.length) {
      record("Search Console", "Visible properties", "FAIL",
        "authenticated fine, but this service account has not been added to ANY Search Console property");
      return [];
    }
    record("Search Console", "Visible properties", "PASS", sites.join(", "));
    return sites;
  } catch (err) {
    record("Search Console", "Visible properties", "FAIL", err.message);
    return null;
  }
}

async function checkSearchConsoleForClient(client, visibleSites) {
  const label = `${client.name} — Search Console`;
  if (!client.gscSiteUrl) {
    record("Search Console", label, "SKIP", "gscSiteUrl not set on this client — captures will use mock data");
    return;
  }
  if (Array.isArray(visibleSites) && visibleSites.length && !visibleSites.includes(client.gscSiteUrl)) {
    record("Search Console", label, "FAIL",
      `gscSiteUrl is "${client.gscSiteUrl}" but the service account can only see: ${visibleSites.join(", ")}`);
    return;
  }

  try {
    const auth = getGoogleAuth();
    const authClient = await auth.getClient();
    const { token } = await authClient.getAccessToken();

    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 28);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(client.gscSiteUrl)}/searchAnalytics/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 5 }),
    });
    if (!res.ok) {
      record("Search Console", label, "FAIL", `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const data = await res.json();
    const rows = data.rows || [];
    if (!rows.length) {
      record("Search Console", label, "WARN", "connected, but no impressions in the last 28 days — nothing to report yet");
      return;
    }
    const top = rows.map((r) => `"${r.keys[0]}" pos ${r.position.toFixed(1)}`).slice(0, 3);
    record("Search Console", label, "PASS", `live data — top queries: ${top.join("; ")}`);
  } catch (err) {
    record("Search Console", label, "FAIL", err.message);
  }
}

// ------------------------------------------------------------------ ga4

async function checkGa4ForClient(client, creds) {
  const label = `${client.name} — GA4`;
  if (!client.ga4PropertyId) {
    record("GA4", label, "SKIP", "ga4PropertyId not set on this client — captures will use mock data");
    return;
  }
  try {
    const { BetaAnalyticsDataClient } = require("@google-analytics/data");
    const analytics = new BetaAnalyticsDataClient({ credentials: creds });
    const [res] = await analytics.runReport({
      property: client.ga4PropertyId,
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    });
    const row = res.rows?.[0]?.metricValues || [];
    const users = row[0]?.value ?? "0";
    const sessions = row[1]?.value ?? "0";
    if (users === "0" && sessions === "0") {
      record("GA4", label, "WARN", `connected to ${client.ga4PropertyId}, but reports 0 users over the last 7 days — check it's the right property`);
    } else {
      record("GA4", label, "PASS", `live data — ${users} users / ${sessions} sessions in the last 7 days`);
    }
  } catch (err) {
    const msg = err.message || String(err);
    const hint = /permission|PERMISSION_DENIED|403/i.test(msg)
      ? ` — add ${creds.client_email} as a Viewer on this GA4 property`
      : /not found|404|INVALID_ARGUMENT/i.test(msg)
        ? ` — check the property ID format, it must look like properties/123456789`
        : "";
    record("GA4", label, "FAIL", msg.slice(0, 200) + hint);
  }
}

// --------------------------------------------------- integrations not built

function checkUnbuilt() {
  const hasDfs = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  record("DataForSEO", "Rank API (KWD-02)", "NOT BUILT",
    hasDfs
      ? "credentials are set, but nothing reads them — callDataForSeo() in keywords.service.js still returns random numbers"
      : "no credentials, and no code to use them — callDataForSeo() returns random numbers");

  record("Business Profile", "GBP API (GMB-03)", "NOT BUILT",
    "there is no Google Business Profile client in this codebase — gmb.service.js returns six hardcoded integers. gmbLocationId is stored but never read");

  record("Conversions", "GA4 key events (CNV-04)", "NOT BUILT",
    "conversions.service.js returns three hardcoded events and never imports the GA4 client, despite what the README says");

  record("AI visibility", "AEO / AIO", "NOT BUILT",
    "no model, route, service or UI exists for answer-engine or AI Overview tracking");
}

// ---------------------------------------------------------------- reporting

const ICON = { PASS: "PASS ", FAIL: "FAIL ", WARN: "WARN ", SKIP: "SKIP ", "NOT BUILT": "-- " };

function report() {
  let area = null;
  console.log("");
  for (const r of results) {
    if (r.area !== area) {
      area = r.area;
      console.log(`\n${area}`);
      console.log("-".repeat(Math.max(area.length, 40)));
    }
    console.log(`  [${(ICON[r.status] || r.status).trim().padEnd(9)}] ${r.name}`);
    if (r.detail) console.log(`              ${r.detail}`);
  }

  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const unbuilt = results.filter((r) => r.status === "NOT BUILT").length;

  console.log("");
  console.log("=".repeat(60));
  console.log(`${results.filter((r) => r.status === "PASS").length} passing, ${fails} failing, ${warns} warnings, ${unbuilt} not built`);
  if (fails) console.log("\nAny FAIL above means that module is silently serving mock data in production.");
  console.log("");
  return fails;
}

async function main() {
  checkEnv();
  const dbOk = await checkDatabase();
  const creds = checkServiceAccount();

  if (dbOk) {
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
    if (!clients.length) {
      record("Clients", "Roster", "WARN", "no clients in the database — run `npm run seed`");
    } else {
      const visibleSites = creds ? await checkSearchConsoleAccess() : null;
      for (const c of clients) {
        if (creds) await checkGa4ForClient(c, creds);
        if (creds) await checkSearchConsoleForClient(c, visibleSites);
      }
    }
  }

  checkUnbuilt();
  const fails = report();
  process.exitCode = fails ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
