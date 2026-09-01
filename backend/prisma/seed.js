// Creates the platform's real admin login and NexIT itself as the one real
// client — no demo data. Generates a random password for each account and
// prints it ONCE; it is never stored in plaintext or retrievable again
// afterward. Safe to re-run: existing users/clients are left untouched
// (upsert on the admin, a name-based check on the client) rather than
// erroring or duplicating.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = new PrismaClient();

const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];

function generatePassword() {
  // 16 random chars from a set that avoids visually-ambiguous characters
  // (no 0/O, 1/l/I) since this gets read off a terminal and typed once.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(16))
    .map((b) => chars[b % chars.length])
    .join("");
}

async function main() {
  const adminEmail = "admin@nexit.au";
  const adminPassword = generatePassword();

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`Admin ${adminEmail} already exists — not touching their password.`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({ data: { email: adminEmail, passwordHash, role: "ADMIN" } });
    console.log(`Admin created: ${adminEmail} / ${adminPassword}`);
    console.log("^ Copy this now — it will not be shown again.");
  }

  let client = await prisma.client.findFirst({ where: { name: "NexIT" } });
  if (client) {
    console.log("Client 'NexIT' already exists — not modifying it.");
  } else {
    client = await prisma.client.create({
      data: {
        name: "NexIT",
        industry: "Managed IT Services",
        gscSiteUrl: "sc-domain:nexit.com.au",
        access: { create: MODULES.map((m) => ({ module: m, granted: false })) },
      },
    });
    console.log(`Client created: NexIT (${client.id})`);
  }

  const reportsEmail = "reports@nexit.au";
  const existingReportsUser = await prisma.user.findUnique({ where: { email: reportsEmail } });
  if (existingReportsUser) {
    console.log(`Client login ${reportsEmail} already exists — not touching their password.`);
  } else {
    const reportsPassword = generatePassword();
    const passwordHash = await bcrypt.hash(reportsPassword, 10);
    await prisma.user.create({
      data: { email: reportsEmail, passwordHash, role: "CLIENT", clientId: client.id },
    });
    console.log(`Client login created: ${reportsEmail} / ${reportsPassword}`);
    console.log("^ Copy this now — it will not be shown again.");
    console.log("(This lets you see NexIT's own dashboard the way a real client would.)");
  }

  console.log("\nNexIT starts with nothing granted — stamp access from its detail page in the admin UI.");
  console.log("Set NexIT's real ga4PropertyId (and confirm gscSiteUrl) from Integration Settings once the service account has Viewer access on its actual properties.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
