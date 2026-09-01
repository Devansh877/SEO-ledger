const express = require("express");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");
const { pollRankingsForClient, addManualRanking } = require("../services/keywords.service");
const { pollAllForClient } = require("../services/poll.service");

const router = express.Router();
router.use(authenticate);

function canView(req, clientId) {
  return req.user.role === "ADMIN" || req.user.clientId === clientId;
}

const REPORT_MODULES = [
  { code: "GA4-01", label: "Analytics" },
  { code: "GMB-03", label: "Business profile" },
  { code: "CNV-04", label: "Conversions" },
];

// GET /settings/:clientId/status — when each of the four modules was last
// captured. Powers the "last refreshed" ledger on the Settings page.
router.get("/:clientId/status", asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  if (!canView(req, clientId)) return res.status(403).json({ error: "Not permitted" });

  const status = {};
  for (const m of REPORT_MODULES) {
    const snap = await prisma.reportSnapshot.findFirst({
      where: { clientId, module: m.code },
      orderBy: { capturedAt: "desc" },
    });
    status[m.code] = { label: m.label, lastCapturedAt: snap?.capturedAt || null };
  }
  // Keyword rankings status is split by source — "last automated capture"
  // (dataforseo/search_console, whichever is most recent) is what the
  // weekly cron cadence actually means; manual entries are tracked
  // separately since they're not on a schedule at all.
  const lastAuto = await prisma.rankSnapshot.findFirst({
    where: { clientId, source: { in: ["dataforseo", "search_console"] } },
    orderBy: { capturedAt: "desc" },
  });
  const lastManual = await prisma.rankSnapshot.findFirst({
    where: { clientId, source: "manual" },
    orderBy: { capturedAt: "desc" },
  });
  status["KWD-02"] = { label: "Keyword rankings (automated)", lastCapturedAt: lastAuto?.capturedAt || null };
  status["KWD-02-manual"] = { label: "Keyword rankings (manual)", lastCapturedAt: lastManual?.capturedAt || null };

  res.json(status);
}));

// POST /settings/:clientId/refresh-all — admin only: manual override of the
// weekly cadence for every module at once (GA4, GMB, Conversions, and
// keyword rankings from both automated sources), same underlying poll the
// weekly cron runs. Does not touch manual keyword entries — those are a
// separate, deliberate action, not something a bulk refresh should overwrite.
router.post("/:clientId/refresh-all", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const result = await pollAllForClient(req.params.clientId);
  res.json({ refreshed: result, at: new Date().toISOString() });
}));

// GET /settings/:clientId/keywords — tracked keyword list, each with its
// targeted location/device and when each source (dataforseo, search
// console, manual) was last captured. Admin can view any client; a client
// can view their own.
router.get("/:clientId/keywords", asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  if (!canView(req, clientId)) return res.status(403).json({ error: "Not permitted" });

  const tracked = await prisma.trackedKeyword.findMany({
    where: { clientId },
    orderBy: { keyword: "asc" },
  });
  const withLastCapture = await Promise.all(
    tracked.map(async (t) => {
      const sources = {};
      for (const source of ["dataforseo", "search_console", "manual"]) {
        const last = await prisma.rankSnapshot.findFirst({
          where: { clientId, keyword: t.keyword, location: t.location, device: t.device, source },
          orderBy: { capturedAt: "desc" },
        });
        sources[source] = last ? { position: last.position, capturedAt: last.capturedAt } : null;
      }
      return {
        id: t.id,
        keyword: t.keyword,
        location: t.location,
        device: t.device,
        sources,
      };
    })
  );
  res.json(withLastCapture);
}));

// POST /settings/:clientId/keywords { keyword, location?, device? } — admin
// only: start tracking a new keyword for a specific location/device (Google
// localizes results, so a keyword isn't fully specified without them).
// Defaults to Melbourne, Victoria, Australia on mobile, gl "au", hl "en".
// Takes an immediate DataForSEO + Search Console snapshot so it's not empty
// until the next weekly poll.
router.post("/:clientId/keywords", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { keyword, location, device, gl, hl } = req.body;
  if (!keyword || !keyword.trim()) return res.status(400).json({ error: "keyword is required" });

  const resolvedLocation = (location && location.trim()) || "Melbourne, Victoria, Australia";
  const resolvedDevice = device === "desktop" ? "desktop" : "mobile";
  const resolvedGl = (gl && gl.trim()) || "au";
  const resolvedHl = (hl && hl.trim()) || "en";

  const tracked = await prisma.trackedKeyword.upsert({
    where: {
      clientId_keyword_location_device_gl_hl: {
        clientId,
        keyword: keyword.trim(),
        location: resolvedLocation,
        device: resolvedDevice,
        gl: resolvedGl,
        hl: resolvedHl,
      },
    },
    update: {},
    create: {
      clientId,
      keyword: keyword.trim(),
      location: resolvedLocation,
      device: resolvedDevice,
      gl: resolvedGl,
      hl: resolvedHl,
    },
  });
  await pollRankingsForClient(clientId); // one-off snapshot for the new keyword, both automated sources
  res.status(201).json(tracked);
}));

// DELETE /settings/:clientId/keywords/:id — admin only: stop tracking a
// keyword. Past snapshots (all sources) are left in place as historical
// record, only the tracked-list entry is removed so future polls and
// manual entries have nothing to attach to.
router.delete("/:clientId/keywords/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { clientId, id } = req.params;
  await prisma.trackedKeyword.deleteMany({ where: { id, clientId } });
  res.status(204).end();
}));

// POST /settings/:clientId/keywords/refresh — admin only: manual override
// of the weekly cadence for the two automated sources (DataForSEO + Search
// Console), e.g. right after onboarding a client. Does not create a manual
// entry — see the dedicated route below for that.
router.post("/:clientId/keywords/refresh", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const snapshots = await pollRankingsForClient(clientId);
  res.json({ refreshed: snapshots.length, at: new Date().toISOString() });
}));

// POST /settings/:clientId/keywords/:id/manual { position, searchVolume?, note? }
// — admin only: record a ranking someone actually checked by hand. This is
// the most accurate of the three sources by definition (a human looked),
// but isn't on any schedule — expect this roughly monthly, whenever
// someone does it, not weekly like the automated sources.
router.post("/:clientId/keywords/:id/manual", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { clientId, id } = req.params;
  const { position, searchVolume, note } = req.body;

  const posNum = Number(position);
  if (!Number.isInteger(posNum) || posNum < 1) {
    return res.status(400).json({ error: "position must be a positive integer" });
  }

  const snap = await addManualRanking(clientId, id, {
    position: posNum,
    searchVolume: searchVolume ? Number(searchVolume) : null,
    note,
  });
  res.status(201).json(snap);
}));

module.exports = router;
