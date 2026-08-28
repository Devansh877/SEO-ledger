// The "Connect Google" flow. Three endpoints: start, callback, disconnect.
const express = require("express");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");
const { isConfigured, buildConsentUrl, exchangeCode, verifyState, redirectUri } = require("../lib/googleOAuth");
const { saveConnection } = require("../services/googleConnection.service");
const { isConfigured: cryptoReady } = require("../lib/crypto");

const router = express.Router();

function frontendUrl(path) {
  const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

// GET /oauth/google/start?clientId=...   (omit clientId for an agency-wide connection)
// Admin only. Returns the consent URL rather than redirecting, so the
// frontend can open it in a popup and keep the admin's place in the UI.
router.get("/google/start", authenticate, requireRole("ADMIN"), asyncHandler(async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "Google OAuth is not configured",
      detail: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, and register this redirect URI in Google Cloud",
      redirectUri: redirectUri(),
    });
  }
  if (!cryptoReady()) {
    return res.status(503).json({
      error: "ENCRYPTION_KEY is not set",
      detail: "Tokens cannot be stored safely without it. Generate one: openssl rand -base64 32",
    });
  }

  const { clientId } = req.query;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: "Client not found" });
  }

  res.json({ url: buildConsentUrl({ clientId: clientId || null, adminUserId: req.user.id }) });
}));

// GET /oauth/google/callback?code=&state=
// Google redirects the browser here, so there's no auth header to check —
// the signed `state` is what proves this callback belongs to a consent flow
// an admin actually started. Always redirects back to the frontend rather
// than rendering, so the admin lands where they left off.
router.get("/google/callback", asyncHandler(async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  const back = (params) =>
    res.redirect(frontendUrl(`/dashboard/settings?${new URLSearchParams(params).toString()}`));

  if (oauthError) return back({ google: "error", reason: oauthError });
  if (!code || !state) return back({ google: "error", reason: "missing_code_or_state" });

  let payload;
  try {
    payload = verifyState(state);
  } catch {
    // Expired (>15m) or forged. Either way, don't touch the database.
    return back({ google: "error", reason: "invalid_state" });
  }

  try {
    const tokens = await exchangeCode(code);
    await saveConnection({ clientId: payload.clientId, ...tokens });
    return back({
      google: "connected",
      email: tokens.email,
      ...(payload.clientId ? { clientId: payload.clientId } : { scope: "agency" }),
    });
  } catch (err) {
    console.error("Google OAuth callback failed:", err.message);
    return back({ google: "error", reason: err.message.slice(0, 200) });
  }
}));

// GET /oauth/google/connections — every connection, for the settings UI.
router.get("/google/connections", authenticate, requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const connections = await prisma.googleConnection.findMany({
    orderBy: [{ clientId: "asc" }, { createdAt: "desc" }],
    include: { client: { select: { id: true, name: true } } },
  });
  // Never serialise the token columns, encrypted or not.
  res.json(connections.map((c) => ({
    id: c.id,
    googleEmail: c.googleEmail,
    scope: c.clientId ? "client" : "agency",
    client: c.client,
    status: c.status,
    lastError: c.lastError,
    lastVerifiedAt: c.lastVerifiedAt,
    createdAt: c.createdAt,
  })));
}));

// DELETE /oauth/google/connections/:id
// Removes our stored grant. Does not revoke it on Google's side — the user
// does that at myaccount.google.com/permissions — so say so plainly rather
// than implying more than happened.
router.delete("/google/connections/:id", authenticate, requireRole("ADMIN"), asyncHandler(async (req, res) => {
  await prisma.googleConnection.deleteMany({ where: { id: req.params.id } });
  res.json({
    deleted: true,
    note: "Stored credentials removed. To revoke the grant on Google's side, the account owner visits https://myaccount.google.com/permissions",
  });
}));

module.exports = router;
