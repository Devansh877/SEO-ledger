// Creates the admin login and NexIT as the first real client.
//
// This replaces the original demo seed (Cyberforte / Meridian Dental /
// Alderton & Co, all sharing the password "password123"). Use
// prisma/purge-demo.js to remove those if they already exist in your
// database.
//
// Safe to re-run: everything is upserted, and passwords are only generated
// and printed for accounts that don't exist yet, so re-running won't lock
// you out of an account you've already changed the password on.
//
// Configuration, all optional — anything left unset can be filled in later
// from the admin UI's Integration Settings panel:
//   ADMIN_EMAIL        default admin@nexit.au
//   NEXIT_CLIENT_EMAIL default reports@nexit.au  (the CLIENT-role login)
//   NEXIT_GA4_PROPERTY e.g. properties/123456789
//   NEXIT_GSC_SITE_URL default sc-domain:nexit.com.au
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = new PrismaClient();

const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@nexit.au";
const CLIENT_EMAIL = process.env.NEXIT_CLIENT_EMAIL || "reports@nexit.au";

const NEXIT = {
  name: "NexIT",
  industry: "Managed IT Services",
  ga4PropertyId: process.env.NEXIT_GA4_PROPERTY || null,
  // A domain property (sc-domain:) covers www, non-www and https variants in
  // one, which is usually what you want. If NexIT's Search Console property
  // is a URL-prefix one instead, set NEXIT_GSC_SITE_URL to the exact prefix
  // including the trailing slash, e.g. https://www.nexit.com.au/
  gscSiteUrl: process.env.NEXIT_GSC_SITE_URL || "sc-domain:nexit.com.au",
  gmbLocationId: null,
};

// GA4-01 and KWD-02 are backed by real APIs. GMB-03 and CNV-04 still
// generate mock numbers, so they start LOCKED — a locked module renders an
// honest "not granted" panel, where a granted one would show a client
// fabricated data indistinguishable from real reporting. Grant them from
// the Access Ledger once the real integrations land.
const INITIAL_ACCESS = {
  "GA4-01": true,
  "KWD-02": true,
  "GMB-03": false,
  "CNV-04": false,
};

function generatePassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomFillSync(new Uint8Array(16)))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

// Only creates a user that doesn't exist. Returns the plaintext password if
// one was generated, or null if the account was already there — so re-runs
// never print a password that isn't actually in use.
async function ensureUser({ email, role, clientId }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return null;

  const password = generatePassword();
  await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), role, clientId: clientId || null },
  });
  return password;
}

async function main() {
  const adminPassword = await ensureUser({ email: ADMIN_EMAIL, role: "ADMIN" });

  // Matched case-insensitively so an existing "Nexit" added by hand isn't
  // duplicated by a second "NexIT" row.
  let client = await prisma.client.findFirst({
    where: { name: { equals: NEXIT.name, mode: "insensitive" } },
  });
  if (!client) {
    client = await prisma.client.create({ data: NEXIT });
  } else {
    // Don't clobber IDs that have since been set from the admin UI — only
    // fill in blanks.
    await prisma.client.update({
      where: { id: client.id },
      data: {
        ga4PropertyId: client.ga4PropertyId || NEXIT.ga4PropertyId,
        gscSiteUrl: client.gscSiteUrl || NEXIT.gscSiteUrl,
      },
    });
  }

  for (const m of MODULES) {
    await prisma.accessGrant.upsert({
      where: { clientId_module: { clientId: client.id, module: m } },
      update: {},
      create: { clientId: client.id, module: m, granted: INITIAL_ACCESS[m] },
    });
  }

  const clientPassword = await ensureUser({
    email: CLIENT_EMAIL,
    role: "CLIENT",
    clientId: client.id,
  });

  const fresh = await prisma.client.findUnique({ where: { id: client.id }, include: { access: true } });

  console.log("");
  console.log("NexIT is set up.");
  console.log("");
  console.log(`  GA4 property     ${fresh.ga4PropertyId || "(not set — add it in Integration Settings)"}`);
  console.log(`  Search Console   ${fresh.gscSiteUrl || "(not set)"}`);
  console.log(`  Modules granted  ${fresh.access.filter((a) => a.granted).map((a) => a.module).join(", ") || "(none)"}`);
  console.log(`  Modules locked   ${fresh.access.filter((a) => !a.granted).map((a) => a.module).join(", ") || "(none)"}`);
  console.log("");

  if (adminPassword || clientPassword) {
    console.log("  Save these now — they are not recoverable and won't be printed again:");
    if (adminPassword) console.log(`    ADMIN   ${ADMIN_EMAIL}  ${adminPassword}`);
    if (clientPassword) console.log(`    CLIENT  ${CLIENT_EMAIL}  ${clientPassword}`);
  } else {
    console.log("  Both logins already existed — passwords left untouched.");
  }
  console.log("");
  console.log("  Next: npm run doctor   (verifies the GA4 / Search Console connections)");
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
