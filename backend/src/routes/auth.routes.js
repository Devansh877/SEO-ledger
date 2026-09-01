const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { sign } = require("../lib/jwt");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// POST /auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = sign({ id: user.id, role: user.role, clientId: user.clientId });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, clientId: user.clientId },
  });
}));

// GET /auth/me
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ id: user.id, email: user.email, role: user.role, clientId: user.clientId });
}));

module.exports = router;
