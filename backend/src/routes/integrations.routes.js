// Property discovery and assignment — the second half of onboarding, after
// a Google account is connected.
const express = require("express");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");
const { discoverForClient } = require("../services/googleProperties.service");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));

// GET /integrations/:clientId/google/properties
// Lists every GA4 property, Search Console site and Business Profile
// location reachable for this client, plus which one is currently selected.
// Live Google calls, so it's slower than a database read — it runs when an
// admin opens the picker, never on a client's dashboard load.
router.get("/:clientId/google/properties", asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
  if (!client) return res.status(404).json({ error: "Client not found" });

  const discovered = await discoverForClient(client.id);
  res.json({
    ...discovered,
    selected: {
      ga4PropertyId: client.ga4PropertyId,
      gscSiteUrl: client.gscSiteUrl,
      gmbLocationId: client.gmbLocationId,
      gmbAccountId: client.gmbAccountId,
    },
  });
}));

// PUT /integrations/:clientId/google/selection
//   { ga4PropertyId?, gscSiteUrl?, gmbLocationId?, gmbAccountId? }
// Saves the admin's picks. Each field is independent — send only what
// changed. Explicit null clears a selection, which is how you deliberately
// send a module back to "not configured".
router.put("/:clientId/google/selection", asyncHandler(async (req, res) => {
  const { ga4PropertyId, gscSiteUrl, gmbLocationId, gmbAccountId } = req.body;
  const data = {};

  // `undefined` means "not sent, leave alone"; null means "clear it".
  if (ga4PropertyId !== undefined) data.ga4PropertyId = ga4PropertyId || null;
  if (gscSiteUrl !== undefined) data.gscSiteUrl = gscSiteUrl || null;
  if (gmbLocationId !== undefined) data.gmbLocationId = gmbLocationId || null;
  if (gmbAccountId !== undefined) data.gmbAccountId = gmbAccountId || null;

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const client = await prisma.client.update({ where: { id: req.params.clientId }, data });
  res.json({
    ga4PropertyId: client.ga4PropertyId,
    gscSiteUrl: client.gscSiteUrl,
    gmbLocationId: client.gmbLocationId,
    gmbAccountId: client.gmbAccountId,
  });
}));

module.exports = router;
