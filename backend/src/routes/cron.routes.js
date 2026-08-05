const express = require("express");
const prisma = require("../lib/prisma");
const { pollAllForClient } = require("../services/poll.service");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// GET /cron/poll-all — hit by Vercel Cron every Sunday (see vercel.json).
// Captures GA4 (with a Monday-Saturday daily breakdown for the week just
// completed), GMB, Conversions, and keyword rankings for every client in
// one run — this is the only place any of the four "live" data sources are
// ever actually fetched. Not behind user auth (a scheduled job has no user
// session) — instead gated by a shared secret Vercel sends automatically
// once CRON_SECRET is set as an env var.
router.get("/poll-all", asyncHandler(async (req, res) => {
  const auth = req.headers.authorization || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const summary = [];
  for (const c of clients) {
    const result = await pollAllForClient(c.id);
    summary.push({ client: c.name, ...result });
  }
  res.json({ polledAt: new Date().toISOString(), summary });
}));

module.exports = router;
