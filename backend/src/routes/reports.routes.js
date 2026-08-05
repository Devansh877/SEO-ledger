const express = require("express");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const checkAccess = require("../middleware/checkAccess");
const asyncHandler = require("../middleware/asyncHandler");
const { getLatestGa4Report } = require("../services/ga4.service");
const { fetchKeywordReport } = require("../services/keywords.service");
const { getLatestGmbReport } = require("../services/gmb.service");
const { getLatestConversionsReport } = require("../services/conversions.service");
const { generateClientReportPdf } = require("../services/pdf.service");

const router = express.Router();
router.use(authenticate);

async function loadClient(clientId) {
  return prisma.client.findUnique({ where: { id: clientId } });
}

// All four routes below read the most recent captured snapshot — none of
// them call a live API on request. If nothing's been captured yet (a
// client onboarded between one weekly cycle and the next, before anyone
// hit "Refresh now" in Settings), they return { notCapturedYet: true }
// rather than a 404, so the frontend can render a distinct "pending first
// capture" state instead of treating it as an error.

router.get("/:clientId/ga4", checkAccess("GA4-01"), asyncHandler(async (req, res) => {
  const report = await getLatestGa4Report(req.params.clientId);
  res.json(report || { notCapturedYet: true });
}));

router.get("/:clientId/keywords", checkAccess("KWD-02"), asyncHandler(async (req, res) => {
  const client = await loadClient(req.params.clientId);
  res.json(await fetchKeywordReport(client));
}));

router.get("/:clientId/gmb", checkAccess("GMB-03"), asyncHandler(async (req, res) => {
  const report = await getLatestGmbReport(req.params.clientId);
  res.json(report || { notCapturedYet: true });
}));

router.get("/:clientId/conversions", checkAccess("CNV-04"), asyncHandler(async (req, res) => {
  const report = await getLatestConversionsReport(req.params.clientId);
  res.json(report || { notCapturedYet: true });
}));

// GET /reports/:clientId/export.pdf — a downloadable snapshot of exactly
// what the requester can already see on the dashboard. Not gated by
// checkAccess("<single module>") like the routes above, since it spans all
// four — instead it checks the requester can view this client at all
// (admin, or the client themselves), then includes only the sections
// actually granted, same as the dashboard would render.
router.get("/:clientId/export.pdf", asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  if (req.user.role !== "ADMIN" && req.user.clientId !== clientId) {
    return res.status(403).json({ error: "Not permitted" });
  }

  const client = await loadClient(clientId);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const grants = await prisma.accessGrant.findMany({ where: { clientId } });
  const access = Object.fromEntries(grants.map((g) => [g.module, g.granted]));

  const [ga4, keywords, gmb, conversions] = await Promise.all([
    access["GA4-01"] ? getLatestGa4Report(clientId) : null,
    access["KWD-02"] ? fetchKeywordReport(client) : null,
    access["GMB-03"] ? getLatestGmbReport(clientId) : null,
    access["CNV-04"] ? getLatestConversionsReport(clientId) : null,
  ]);

  const pdfBuffer = await generateClientReportPdf({ client, access, ga4, keywords, gmb, conversions });

  const filename = `${client.name.replace(/[^a-z0-9]+/gi, "-")}-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
}));

module.exports = router;
