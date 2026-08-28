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

// Business Profile needs two calls: accounts, then locations per account.
//
// Both APIs return 403 with quota 0 until Google approves an access request
// for the Cloud project — approval is a manual review, not a toggle. That
// 403 is surfaced as a typed error rather than an empty list, so the UI can
// say "awaiting Google approval" instead of "no locations found".
async function listBusinessProfileLocations(token) {
  let accounts;
  try {
    accounts = await getJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
  } catch (err) {
    if (err.status === 403) {
      const e = new Error(
        "Business Profile API returned 403. The Google Cloud project has no Business Profile quota " +
        "until an access request is approved: https://developers.google.com/my-business/content/prereqs"
      );
      e.needsApproval = true;
      throw e;
    }
    throw err;
  }

  const out = [];
  for (const account of accounts.accounts || []) {
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
    url.searchParams.set("readMask", "name,title,storefrontAddress");
    url.searchParams.set("pageSize", "100");
    try {
      const data = await getJson(url.toString(), token);
      for (const loc of data.locations || []) {
        const city = loc.storefrontAddress?.locality;
        out.push({
          id: loc.name,                      // "locations/123"
          label: city ? `${loc.title} — ${city}` : loc.title,
          group: account.accountName || account.name,
          accountId: account.name,           // stored alongside; performance calls need both
        });
      }
    } catch (err) {
      console.error(`Failed listing locations for ${account.name}: ${err.message}`);
    }
  }
  return out;
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
  let ga4Error = null, gscError = null, gbpError = null, gbpNeedsApproval = false;

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
    else { gbpError = b.reason.message; gbpNeedsApproval = !!b.reason.needsApproval; }
  }

  const state = (items, error, extra) =>
    items.length ? { status: "ok", items: dedupe(items) }
                 : { status: error ? "error" : "empty", items: [], error, ...extra };

  return {
    connected: summaries.some((c) => c.status === "active"),
    connections: summaries,
    ga4: state(ga4, ga4Error),
    searchConsole: state(gsc, gscError),
    businessProfile: state(gbp, gbpError, gbpNeedsApproval ? { needsApproval: true } : {}),
  };
}

module.exports = {
  listGa4Properties, listSearchConsoleSites, listBusinessProfileLocations, discoverForClient,
};
