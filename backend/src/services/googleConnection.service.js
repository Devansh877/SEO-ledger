// Stores and uses GoogleConnection rows: encrypts tokens on the way in,
// refreshes expired access tokens on the way out, and marks a connection
// needs_reconnect when Google says the grant is gone for good.
const prisma = require("../lib/prisma");
const { encrypt, decrypt } = require("../lib/crypto");
const { refreshAccessToken } = require("../lib/googleOAuth");

// Refresh a little before actual expiry — a token that dies mid-request
// during a long weekly capture is a confusing failure to debug.
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

async function saveConnection({ clientId, email, accessToken, refreshToken, expiresAt, scopes }) {
  // One connection per (client, Google account). Reconnecting the same
  // account replaces the old grant rather than accumulating dead rows.
  const existing = await prisma.googleConnection.findFirst({
    where: { clientId: clientId || null, googleEmail: email },
  });

  const data = {
    clientId: clientId || null,
    googleEmail: email,
    accessToken: encrypt(accessToken),
    refreshToken: encrypt(refreshToken),
    expiresAt,
    scopes,
    status: "active",
    lastError: null,
    lastVerifiedAt: new Date(),
  };

  return existing
    ? prisma.googleConnection.update({ where: { id: existing.id }, data })
    : prisma.googleConnection.create({ data });
}

// Returns a usable access token, refreshing first if it's expired or close
// to it. Returns null (rather than throwing) when the connection is dead, so
// a single broken client doesn't abort a whole weekly poll.
async function getAccessToken(connection) {
  if (connection.status !== "active") return null;

  const stillValid =
    connection.accessToken &&
    connection.expiresAt &&
    new Date(connection.expiresAt).getTime() - EXPIRY_SKEW_MS > Date.now();

  if (stillValid) {
    try { return decrypt(connection.accessToken); } catch { /* fall through and refresh */ }
  }

  try {
    const { accessToken, expiresAt } = await refreshAccessToken(decrypt(connection.refreshToken));
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encrypt(accessToken),
        expiresAt,
        status: "active",
        lastError: null,
        lastVerifiedAt: new Date(),
      },
    });
    return accessToken;
  } catch (err) {
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: {
        status: err.needsReconnect ? "needs_reconnect" : connection.status,
        lastError: err.message.slice(0, 500),
      },
    });
    console.error(`Google connection ${connection.id} (${connection.googleEmail}) failed: ${err.message}`);
    return null;
  }
}

// Every connection that could serve this client: its own, plus agency-wide
// ones. Client-specific first — if a client granted access directly, that's
// the more deliberate grant and should win.
async function connectionsFor(clientId) {
  const [own, agency] = await Promise.all([
    clientId
      ? prisma.googleConnection.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.googleConnection.findMany({ where: { clientId: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return [...own, ...agency];
}

// The first connection that yields a working token for this client. Used by
// every capture service — GA4, Search Console, Business Profile — so they
// all resolve credentials the same way.
async function tokenForClient(clientId) {
  for (const connection of await connectionsFor(clientId)) {
    const token = await getAccessToken(connection);
    if (token) return { token, connection };
  }
  return null;
}

module.exports = { saveConnection, getAccessToken, connectionsFor, tokenForClient };
