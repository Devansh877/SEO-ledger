// Password rules, generation, and reset tokens.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const MIN_LENGTH = 12;

// Length is the requirement that actually matters. Composition rules
// ("one uppercase, one symbol") push people toward Password1! — predictable
// to a cracker and hard to remember — so the only additional check here is
// against passwords that are obviously the account itself.
function validate(password, { email } = {}) {
  if (!password || typeof password !== "string") return "A password is required";
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (password.length > 200) return "Password must be under 200 characters";

  const lower = password.toLowerCase();
  if (email && lower.includes(email.toLowerCase().split("@")[0])) {
    return "Password must not contain your email address";
  }
  const OBVIOUS = ["password", "12345678", "qwerty", "letmein", "changeme", "seoledger"];
  if (OBVIOUS.some((w) => lower.includes(w))) {
    return "Password is too easily guessed — pick something less common";
  }
  return null; // valid
}

// Generated passwords get read aloud or pasted into a message during
// onboarding, so ambiguous glyphs (0/O, 1/l/I) are excluded. 16 characters
// from a 54-character alphabet is roughly 92 bits of entropy, which is
// ample for a credential that must be changed on first use anyway.
function generate(length = 16) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomFillSync(new Uint8Array(length)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

const hash = (password) => bcrypt.hash(password, 10);
const compare = (password, passwordHash) => bcrypt.compare(password, passwordHash);

// Reset tokens: the raw value goes in the link, only its hash is stored.
// SHA-256 rather than bcrypt here because the token is already 256 bits of
// randomness — there is nothing to brute-force, and a fast hash lets lookup
// be a single indexed query instead of comparing against every row.
function newResetToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: crypto.createHash("sha256").update(token).digest("hex") };
}
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

module.exports = { MIN_LENGTH, validate, generate, hash, compare, newResetToken, hashResetToken };
