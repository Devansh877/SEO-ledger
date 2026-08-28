// Property discovery — the piece that makes onboarding a client a dropdown
// rather than a scavenger hunt for IDs.
//
// Each function lists what a connected Google account can actually see, so
// an admin picks "NexIT - www.nexit.com.au" instead of finding and pasting
// "properties/123456789". Results are unioned across every connection
// available to that client (its own, plus any agency-wide ones) and
// deduplicated by ID, since one property is often visible through more than
// one connected account.
const { connectionsFor, getAccessToken } = require("./googleConnection.service");

async function getJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// GA4 Admin API. accountSummaries returns accounts with their properties
// nested, which is one call for the whole tree instead of one per account.
async function listGa4Properties(token) {
  const out = [];
  let pageToken;
  do {
    const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await getJson(url.toString(), token);

    for (const account of data.accountSummaries || []) {
      for (const p of account.propertySummaries || []) {
        out.push({
          id: p.property,                    // "properties/123456789"
          label: p.displayName,
          group: account.displayName,        // the GA4 account it sits under
        });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function listSearchConsoleSites(token) {
  const data = await getJson("https://www.googleapis.com/webmasters/v3/sites", token);
  return (data.siteEntry || [])
    // siteUnverifiedUser can't run Search Analytics queries, so offering it
    // would produce a connection that looks fine and returns nothing.
    .filter((s) => s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({
      id: s.siteUrl,                         // "sc-domain:example.com" or a URL prefix
      label: s.siteUrl,
      group: s.permissionLevel,
    }));
}

// Business Profile is deferred to a later version — the OAuth grant no
// longer requests business.manage, so there is nothing to list. Kept as an
// explicit status rather than removed entirely so the UI renders an honest
// "not enabled yet" instead of an empty dropdown that looks broken.
async function listBusinessProfileLocations() {
  const err = new Error("Business Profile is not enabled in this version");
  err.notEnabled = true;
  throw err;
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Everything selectable for one client, across all its connections. Each
// product reports its own status so a partial failure (Business Profile
// pending approval, say) still lets the admin pick GA4 and Search Console.
async function discoverForClient(clientId) {
  const connections = await connectionsFor(clientId);
  if (!connections.length) {
    return {
      connected: false,
      connections: [],
      ga4: { status: "no_connection", items: [] },
      searchConsole: { status: "no_connection", items: [] },
      businessProfile: { status: "no_connection", items: [] },
    };
  }

  const ga4 = [], gsc = [], gbp = [];
  const summaries = [];
  let ga4Error = null, gscError = null, gbpError = null, gbpNotEnabled = false;

  for (const connection of connections) {
    const token = await getAccessToken(connection);
    summaries.push({
      id: connection.id,
      email: connection.googleEmail,
      scope: connection.clientId ? "client" : "agency",
      status: token ? connection.status : "needs_reconnect",
      lastError: connection.lastError,
    });
    if (!token) continue;

    const [a, s, b] = await Promise.allSettled([
      listGa4Properties(token),
      listSearchConsoleSites(token),
      listBusinessProfileLocations(token),
    ]);
    if (a.status === "fulfilled") ga4.push(...a.value); else ga4Error = a.reason.message;
    if (s.status === "fulfilled") gsc.push(...s.value); else gscError = s.reason.message;
    if (b.status === "fulfilled") gbp.push(...b.value);
    else { gbpError = b.reason.message; gbpNotEnabled = !!b.reason.notEnabled; }
  }

  const state = (items, error, extra) =>
    items.length ? { status: "ok", items: dedupe(items) }
                 : { status: error ? "error" : "empty", items: [], error, ...extra };

  return {
    connected: summaries.some((c) => c.status === "active"),
    connections: summaries,
    ga4: state(ga4, ga4Error),
    searchConsole: state(gsc, gscError),
    businessProfile: gbpNotEnabled
      ? { status: "not_enabled", items: [] }
      : state(gbp, gbpError),
  };
}

module.exports = {
  listGa4Properties, listSearchConsoleSites, listBusinessProfileLocations, discoverForClient,
};
