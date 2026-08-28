// Google OAuth for connecting client properties.
//
// Why OAuth rather than the service account this app started with:
//
//   A service account can only read a property after someone manually adds
//   its email as a user on that property — per client, per product. That's
//   three pieces of admin work and a property ID to copy by hand before a
//   single number appears, and it doesn't work at all for Business Profile,
//   which has no service-account path.
//
//   With OAuth, one sign-in grants all three products at once, and the app
//   can then LIST what that account can see. The admin picks properties from
//   a dropdown instead of pasting IDs, and nobody has to know what a GA4
//   property ID looks like.
//
// Setup, once, in one Google Cloud project:
//   1. Enable: analyticsdata, analyticsadmin, searchconsole,
//      mybusinessaccountmanagement, mybusinessbusinessinformation,
//      businessprofileperformance
//   2. Credentials -> OAuth client ID -> Web application
//   3. Authorised redirect URI: <BACKEND_URL>/oauth/google/callback
//   4. Set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
//
// IMPORTANT — publish the OAuth consent screen to "In production". While it
// sits in "Testing" with an External user type, Google expires every refresh
// token after 7 days, which silently breaks the weekly capture for every
// connected client. See:
// https://developers.google.com/identity/protocols/oauth2#expiration
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

// Read-only only. Business Profile is deliberately not requested: its
// narrowest scope is business.manage, which grants WRITE access to a
// client's listings, and Google offers no read-only variant. Asking a
// client to hand over edit rights on their own Business Profile just to
// display view counts is a bad trade, and it makes both Google's
// verification review and the consent screen harder to get through.
//
// When Business Profile is added in a later version, append
// "https://www.googleapis.com/auth/business.manage" here — existing
// connections will then show as missing a scope (see scopes on
// GoogleConnection) and need reconnecting to pick it up.
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "openid",
  "email",
];

function isConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri() {
  const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
  return `${base}/oauth/google/callback`;
}

function newClient() {
  if (!isConfigured()) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set");
  }
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri()
  );
}

// The `state` parameter is signed rather than random-and-stored: it carries
// which client this consent is for, and signing it means the callback can
// trust that without a server-side session — which serverless functions
// don't reliably have. Short expiry because a consent flow is a matter of
// minutes, and a stale state should fail rather than be replayed.
function signState(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || "dev-secret-change-me", { expiresIn: "15m" });
}
function verifyState(state) {
  return jwt.verify(state, process.env.JWT_SECRET || "dev-secret-change-me");
}

// clientId null => an agency-wide connection usable for every client.
function buildConsentUrl({ clientId, adminUserId }) {
  return newClient().generateAuthUrl({
    // Required to receive a refresh token at all — without it Google returns
    // only a one-hour access token and the weekly cron has nothing durable.
    access_type: "offline",
    // Google omits the refresh token on repeat consents unless forced. Since
    // reconnecting is exactly when the old one has stopped working, always
    // ask, or a reconnect silently yields no usable credential.
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state: signState({ clientId: clientId || null, adminUserId }),
  });
}

// Exchanges the one-time code for tokens and identifies the account that
// granted them.
async function exchangeCode(code) {
  const client = newClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh token. This happens when the account has already granted " +
      "consent and prompt=consent was not sent. Revoke this app at " +
      "https://myaccount.google.com/permissions and connect again."
    );
  }

  let email = "unknown";
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });
    email = ticket.getPayload()?.email || "unknown";
  }

  return {
    email,
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: tokens.scope || SCOPES.join(" "),
  };
}

// Trades a refresh token for a fresh access token. Throws with a flag the
// caller uses to mark the connection needs_reconnect, since an invalid_grant
// is permanent — retrying it forever is pointless and hides the real cause.
async function refreshAccessToken(refreshToken) {
  const client = newClient();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    };
  } catch (err) {
    const detail = err?.response?.data?.error || err.message || "";
    const permanent = /invalid_grant|unauthorized_client|invalid_client/i.test(detail);
    const e = new Error(
      permanent
        ? `Google rejected the refresh token (${detail}). Most often: the user revoked access, or the ` +
          "OAuth consent screen is still in Testing status, where refresh tokens expire after 7 days. " +
          "This connection must be re-authorised."
        : `Token refresh failed: ${detail}`
    );
    e.needsReconnect = permanent;
    throw e;
  }
}

module.exports = { SCOPES, isConfigured, redirectUri, buildConsentUrl, exchangeCode, refreshAccessToken, verifyState };
