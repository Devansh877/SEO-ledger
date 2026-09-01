// Boot-time configuration check.
//
// Several variables have historically had "safe-looking" fallbacks that are
// actively dangerous in production:
//   JWT_SECRET   -> "dev-secret-change-me", a value published in this
//                   repository. Anyone can mint an admin token with it.
//   FRONTEND_URL -> CORS origin "*", accepting requests from any site.
//   ENCRYPTION_KEY absent -> OAuth connections cannot be stored at all.
//
// Each of those is a silent misconfiguration: the app starts, looks fine,
// and is wrong. So in production a missing value stops the boot instead.
// Locally the fallbacks stay, with a warning, so `npm run dev` still works
// on a fresh clone.
const IS_PRODUCTION = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

const REQUIRED_IN_PRODUCTION = [
  ["DATABASE_URL", "Postgres connection string"],
  ["JWT_SECRET", "session signing key — generate with: openssl rand -base64 48"],
  ["FRONTEND_URL", "public URL of the frontend, used as the CORS allow-list"],
];

const RECOMMENDED = [
  ["ENCRYPTION_KEY", "required to store Google OAuth connections — openssl rand -base64 32"],
  ["CRON_SECRET", "without it /cron/poll-all rejects every request and the weekly capture never runs"],
];

function assertValid() {
  const missing = REQUIRED_IN_PRODUCTION.filter(([name]) => !process.env[name]);
  const weakSecret = process.env.JWT_SECRET === "dev-secret-change-me" ||
    (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32);

  if (IS_PRODUCTION && (missing.length || weakSecret)) {
    const lines = [
      "Refusing to start — configuration is unsafe for production:",
      ...missing.map(([name, why]) => `  ${name} is not set (${why})`),
    ];
    if (weakSecret) {
      lines.push("  JWT_SECRET is the published default or under 32 characters — anyone could forge an admin session");
    }
    throw new Error(lines.join("\n"));
  }

  for (const [name, why] of missing) {
    console.warn(`[config] ${name} is not set — ${why}. This would stop the boot in production.`);
  }
  for (const [name, why] of RECOMMENDED) {
    if (!process.env[name]) console.warn(`[config] ${name} is not set — ${why}`);
  }
}

// Explicit allow-list rather than "*", so a missing variable can't quietly
// open the API to every origin.
function corsOrigin() {
  const configured = process.env.FRONTEND_URL;
  if (!configured) return IS_PRODUCTION ? false : true; // dev: reflect origin
  return configured.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

module.exports = { IS_PRODUCTION, assertValid, corsOrigin };
