// AES-256-GCM encryption for OAuth tokens at rest.
//
// A Google refresh token is a long-lived key to a client's analytics,
// Search Console and Business Profile data. Stored in plaintext, a database
// dump — or a stray Prisma Studio session — hands all of that over. GCM is
// used rather than CBC because it authenticates the ciphertext, so a
// tampered row fails loudly instead of decrypting to garbage.
//
// ENCRYPTION_KEY must be 32 bytes, base64-encoded:
//   openssl rand -base64 32
//
// Rotating the key invalidates every stored token, which means every
// connection has to be re-authorised through the consent screen. Nothing is
// lost permanently, but each client would need to click Connect again.
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96 bits, the size GCM is defined for
const TAG_LENGTH = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. OAuth tokens cannot be stored without it. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}. ` +
      "Generate a correct one with: openssl rand -base64 32"
    );
  }

  cachedKey = key;
  return key;
}

// Returns "iv.tag.ciphertext", all base64. Self-describing, so decrypt()
// needs no other stored state.
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function decrypt(payload) {
  if (payload === null || payload === undefined) return null;

  const parts = String(payload).split(".");
  if (parts.length !== 3) {
    throw new Error("Encrypted value is malformed — expected iv.tag.ciphertext");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    // GCM's auth tag failing means the key changed or the row was altered.
    throw new Error(
      "Failed to decrypt — ENCRYPTION_KEY has changed since this value was stored, " +
      "or the stored value was modified. Affected connections must be re-authorised."
    );
  }
}

// True when a key is configured and usable, without throwing. The doctor
// script uses this to report the problem rather than crash on it.
function isConfigured() {
  try { getKey(); return true; } catch { return false; }
}

module.exports = { encrypt, decrypt, isConfigured };
