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
