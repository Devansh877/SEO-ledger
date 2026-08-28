// Shared service-account auth for GA4 Data API and Search Console API —
// both were granted access using the same service account (see README),
// so both read credentials from the same env var here.
const { GoogleAuth } = require("google-auth-library");

let cachedCredentials = null;

// Decodes GA4_SERVICE_ACCOUNT_KEY_BASE64 (or GSC_SERVICE_ACCOUNT_KEY_BASE64
// as a fallback, in case someone used a separate service account for each)
// into the actual JSON key object. Returns null if neither is set — every
// caller treats that as "fall back to mock data" rather than crashing, so
// the app still works before real credentials are configured.
function getServiceAccountCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY_BASE64 || process.env.GSC_SERVICE_ACCOUNT_KEY_BASE64;
  if (!raw) return null;

  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    cachedCredentials = JSON.parse(json);
    return cachedCredentials;
  } catch (err) {
    console.error("Failed to parse service account key — check the base64 env var is the full, unmodified JSON file:", err.message);
    return null;
  }
}

// A GoogleAuth client scoped for both APIs' read-only scopes. Cached per
// process (not per request) since token refresh is handled internally by
// the library.
let cachedAuth = null;
function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;

  cachedAuth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
  });
  return cachedAuth;
}

module.exports = { getServiceAccountCredentials, getGoogleAuth };

// ---------------------------------------------------------------------------
// Per-client auth resolution.
//
// Two credential sources now exist, and every capture service has to pick
// between them the same way or they drift apart:
//
//   1. An OAuth connection for this client (its own, or an agency-wide one).
//      This is the path for anything onboarded through "Connect Google".
//   2. The original service account, still honoured for properties that were
//      wired up before OAuth existed, so upgrading doesn't break them.
//
// OAuth wins when both are present: it's the deliberate, per-client grant,
// and the service account is only still here for backwards compatibility.
//
// Returns null when neither is available — callers treat that as "fall back
// to mock data", which is what keeps an unconfigured client rendering
// something instead of erroring.
// ---------------------------------------------------------------------------
const { OAuth2Client } = require("google-auth-library");

async function resolveAuthForClient(clientId) {
  // Required lazily: googleConnection.service pulls in prisma, and importing
  // it at module load would create a cycle through the services that import
  // this file.
  const { tokenForClient } = require("../services/googleConnection.service");

  try {
    const resolved = await tokenForClient(clientId);
    if (resolved) {
      return {
        mode: "oauth",
        accessToken: resolved.token,
        connection: resolved.connection,
        // A pre-authorised client the Google client libraries accept directly,
        // so callers don't each have to build one.
        authClient: (() => {
          const c = new OAuth2Client();
          c.setCredentials({ access_token: resolved.token });
          return c;
        })(),
      };
    }
  } catch (err) {
    console.error(`OAuth resolution failed for client ${clientId}: ${err.message}`);
  }

  const credentials = getServiceAccountCredentials();
  if (credentials) return { mode: "service_account", credentials };

  return null;
}

// Bearer token for plain REST calls (Search Console), from whichever source
// resolveAuthForClient picked.
async function accessTokenForClient(clientId) {
  const auth = await resolveAuthForClient(clientId);
  if (!auth) return null;
  if (auth.mode === "oauth") return auth.accessToken;

  const googleAuth = getGoogleAuth();
  if (!googleAuth) return null;
  const client = await googleAuth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

module.exports.resolveAuthForClient = resolveAuthForClient;
module.exports.accessTokenForClient = accessTokenForClient;
