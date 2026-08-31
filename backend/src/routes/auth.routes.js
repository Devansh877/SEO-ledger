const express = require("express");
const prisma = require("../lib/prisma");
const { sign } = require("../lib/jwt");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const password = require("../lib/password");
const mailer = require("../lib/mailer");

const router = express.Router();

// Login throttling. Counters live in the database, not memory, because
// serverless invocations don't share process state — an in-memory counter
// resets on every cold start and throttles nothing.
const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;

// POST /auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password: submitted } = req.body;
  if (!email || !submitted) return res.status(400).json({ error: "Email and password are required" });

  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });

  // Same response whether the account exists or the password is wrong.
  // Distinguishing them turns this endpoint into a way to enumerate which
  // of a client's staff have accounts.
  const invalid = () => res.status(401).json({ error: "Invalid credentials" });
  if (!user) return invalid();

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
  }

  if (!(await password.compare(submitted, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    return invalid();
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  res.json({
    token: sign({ id: user.id, role: user.role, clientId: user.clientId }),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      // The client gates the dashboard on this. A generated password that
      // was messaged or read aloud shouldn't stay in use.
      mustChangePassword: user.mustChangePassword,
    },
  });
}));

// GET /auth/me
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Account no longer exists" });
  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    mustChangePassword: user.mustChangePassword,
  });
}));

// POST /auth/change-password { currentPassword, newPassword }
// Requires the current password even though the caller is authenticated —
// otherwise a borrowed laptop with an open session is enough to take the
// account over permanently.
router.post("/change-password", authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Account no longer exists" });

  if (!(await password.compare(currentPassword || "", user.passwordHash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const problem = password.validate(newPassword, { email: user.email });
  if (problem) return res.status(400).json({ error: problem });

  if (await password.compare(newPassword, user.passwordHash)) {
    return res.status(400).json({ error: "New password must be different from the current one" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await password.hash(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  // Any outstanding reset links are invalidated — the account is now known
  // to be under the owner's control, and a stale link is a way back in.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  res.json({ changed: true });
}));

// POST /auth/forgot-password { email }
// Always answers the same way regardless of whether the address is known,
// so this can't be used to discover who has an account.
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  const generic = {
    ok: true,
    message: "If that email has an account, a reset link is on its way.",
  };

  if (!mailer.isConfigured()) {
    // Told plainly rather than pretending to send. Without SMTP the
    // supported path is an admin resetting the password from the dashboard.
    return res.status(503).json({
      error: "Self-service reset isn't available",
      detail: "Email delivery isn't configured on this deployment. Ask your account manager to reset your password.",
    });
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) return res.json(generic);

  // Supersede any earlier outstanding links so only the newest works.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = password.newResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60000),
    },
  });

  const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  try {
    await mailer.sendPasswordReset({
      to: user.email,
      resetUrl: `${base}/reset-password?token=${encodeURIComponent(token)}`,
      expiresInMinutes: RESET_TOKEN_MINUTES,
    });
  } catch (err) {
    // Logged, but still answered generically — a delivery failure shouldn't
    // reveal that the address exists.
    console.error(`Password reset email failed for ${user.email}:`, err.message);
  }

  res.json(generic);
}));

// POST /auth/reset-password { token, newPassword }
router.post("/reset-password", asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token) return res.status(400).json({ error: "Reset token is required" });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: password.hashResetToken(String(token)) },
    include: { user: true },
  });

  // One message for missing, spent and expired alike — the differences are
  // only useful to someone probing tokens.
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  }

  const problem = password.validate(newPassword, { email: record.user.email });
  if (problem) return res.status(400).json({ error: problem });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await password.hash(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        // A successful reset clears a lockout — the owner has proven
        // control of the mailbox, so leaving them locked out helps nobody.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ reset: true });
}));

module.exports = router;
