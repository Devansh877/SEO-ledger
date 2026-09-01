const jwt = require("jsonwebtoken");

// Read at call time, not module load, so a test or script can set it after
// requiring this. The dev fallback only applies outside production — see
// lib/config.js, which refuses to boot without a real secret there.
function secret() {
  const configured = process.env.JWT_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("JWT_SECRET is not set — refusing to sign or verify tokens with a known default");
  }
  return "dev-secret-change-me";
}

function sign(payload) {
  return jwt.sign(payload, secret(), { expiresIn: "8h" });
}
function verify(token) {
  return jwt.verify(token, secret());
}
module.exports = { sign, verify };
