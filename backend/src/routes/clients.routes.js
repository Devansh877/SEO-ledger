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

// POST /clients { name, industry, email, ga4PropertyId?, gmbLocationId? }
// — admin only: onboard a new client, a blank access ledger (nothing
// granted until the admin stamps it), and a login for that client. The
// temporary password is generated here, hashed before storage, and
// returned in this response ONLY — it isn't retrievable again afterward,
// same as any other "here's your temp password, go change it" flow.
router.post("/", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { name, industry, email, ga4PropertyId, gmbLocationId } = req.body;
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

module.exports = router;
