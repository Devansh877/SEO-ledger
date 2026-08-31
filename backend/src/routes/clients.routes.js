const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(authenticate);

// GET /clients — admin only: full roster with each client's access ledger.
router.get("/", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const clients = await prisma.client.findMany({
    include: { access: true },
    orderBy: { name: "asc" },
  });
  res.json(clients);
}));

// GET /clients/:id — admin, or the client viewing their own record.
router.get("/:id", asyncHandler(async (req, res) => {
  if (req.user.role === "CLIENT" && req.user.clientId !== req.params.id) {
    return res.status(403).json({ error: "Not your client record" });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { access: true },
  });
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
}));

function generateTemporaryPassword() {
  // Readable-ish, avoids ambiguous characters (0/O, 1/l/I) since this gets
  // manually copy-pasted or read aloud to a client during onboarding.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomFillSync(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

// POST /clients { name, industry, email, ga4PropertyId?, gmbLocationId?, gscSiteUrl? }
// — admin only: onboard a new client, a blank access ledger (nothing
// granted until the admin stamps it), and a login for that client. The
// temporary password is generated here, hashed before storage, and
// returned in this response ONLY — it isn't retrievable again afterward,
// same as any other "here's your temp password, go change it" flow.
router.post("/", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { name, industry, email, ga4PropertyId, gmbLocationId, gscSiteUrl } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!email || !email.trim()) return res.status(400).json({ error: "email is required" });

  const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existing) return res.status(409).json({ error: "A user with this email already exists" });

  const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];
  const client = await prisma.client.create({
    data: {
      name: name.trim(),
      industry: industry?.trim() || "",
      ga4PropertyId: ga4PropertyId?.trim() || null,
      gmbLocationId: gmbLocationId?.trim() || null,
      gscSiteUrl: gscSiteUrl?.trim() || null,
      access: { create: MODULES.map((m) => ({ module: m, granted: false })) },
    },
    include: { access: true },
  });

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await prisma.user.create({
    data: { email: email.trim(), passwordHash, role: "CLIENT", clientId: client.id },
  });

  res.status(201).json({ client, loginEmail: email.trim(), temporaryPassword });
}));

// PUT /clients/:id { name?, industry?, ga4PropertyId?, gmbLocationId?, gscSiteUrl? }
// — admin only: edit an existing client's details, most commonly attaching
// real GA4/GMB/Search Console identifiers after onboarding (these start
// blank even for a client created with them, since most agencies don't
// have every ID on hand at signup time).
router.put("/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { name, industry, ga4PropertyId, gmbLocationId, gscSiteUrl } = req.body;
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (industry !== undefined) data.industry = industry.trim();
  if (ga4PropertyId !== undefined) data.ga4PropertyId = ga4PropertyId.trim() || null;
  if (gmbLocationId !== undefined) data.gmbLocationId = gmbLocationId.trim() || null;
  if (gscSiteUrl !== undefined) data.gscSiteUrl = gscSiteUrl.trim() || null;

  const client = await prisma.client.update({
    where: { id: req.params.id },
    data,
    include: { access: true },
  });
  res.json(client);
}));

// DELETE /clients/:id — admin only: permanently remove a client and
// everything attached to them.
//
// Requires ?confirm=<exact client name> in the query string. Prisma has no
// cascade configured on these relations, so a bare delete would fail on the
// foreign keys anyway — but the real reason for the confirmation is that
// this destroys captured history that cannot be re-fetched. Ranking APIs
// only ever return today's position, so deleted RankSnapshot rows are gone
// for good; no amount of re-polling rebuilds a trend line.
router.delete("/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { users: true },
  });
  if (!client) return res.status(404).json({ error: "Client not found" });

  if (req.query.confirm !== client.name) {
    return res.status(400).json({
      error: "Confirmation required",
      detail: `Pass ?confirm=<client name> matching exactly: "${client.name}"`,
    });
  }

  // Counted before deletion so the response can report what actually went,
  // rather than the caller having to trust that it worked.
  const [keywords, ranks, reports, grants, connections] = await Promise.all([
    prisma.trackedKeyword.count({ where: { clientId: client.id } }),
    prisma.rankSnapshot.count({ where: { clientId: client.id } }),
    prisma.reportSnapshot.count({ where: { clientId: client.id } }),
    prisma.accessGrant.count({ where: { clientId: client.id } }),
    prisma.googleConnection.count({ where: { clientId: client.id } }),
  ]);

  // Children first — every one of these references clientId.
  await prisma.$transaction([
    prisma.rankSnapshot.deleteMany({ where: { clientId: client.id } }),
    prisma.reportSnapshot.deleteMany({ where: { clientId: client.id } }),
    prisma.trackedKeyword.deleteMany({ where: { clientId: client.id } }),
    prisma.accessGrant.deleteMany({ where: { clientId: client.id } }),
    prisma.googleConnection.deleteMany({ where: { clientId: client.id } }),
    prisma.user.deleteMany({ where: { clientId: client.id } }),
    prisma.client.delete({ where: { id: client.id } }),
  ]);

  res.json({
    deleted: client.name,
    removed: {
      logins: client.users.length,
      accessGrants: grants,
      trackedKeywords: keywords,
      rankSnapshots: ranks,
      reportSnapshots: reports,
      googleConnections: connections,
    },
  });
}));

module.exports = router;
