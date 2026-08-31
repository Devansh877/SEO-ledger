// One-off cleanup: removes the three demo clients seeded by the original
// prisma/seed.js (Cyberforte, Meridian Dental, Alderton & Co) along with
// every row that hangs off them — logins, access grants, tracked keywords,
// rank snapshots and report snapshots.
//
// Deliberately conservative:
//   - It only ever touches clients whose name is in DEMO_CLIENT_NAMES below.
//     Nothing else in the database is considered, so a real client can't be
//     caught by accident even if it shares an industry or a keyword.
//   - It prints exactly what it found and refuses to delete anything unless
//     you pass --confirm. A dry run is the default because this is not
//     reversible.
//
//   node prisma/purge-demo.js              # dry run, shows what would go
//   node prisma/purge-demo.js --confirm    # actually deletes
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEMO_CLIENT_NAMES = ["Cyberforte", "Meridian Dental", "Alderton & Co"];
// The demo admin from the original seed. Removed too — it uses the shared
// "password123" that every demo login shared, so it must not survive into
// a live deployment.
const DEMO_ADMIN_EMAIL = "admin@nexit.demo";

const confirmed = process.argv.includes("--confirm");

async function main() {
  const clients = await prisma.client.findMany({
    where: { name: { in: DEMO_CLIENT_NAMES } },
    include: { users: true },
  });

  let demoAdmin = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });

  // Guard against locking yourself out. The demo admin is very likely the
  // account you're signed in as right now, and deleting it with no
  // replacement leaves nobody who can administer the platform — with no
  // self-service password reset to recover through. Run `npm run seed`
  // first; it creates the real admin.
  if (demoAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", email: { not: DEMO_ADMIN_EMAIL } },
    });
    if (otherAdmins === 0) {
      console.log("");
      console.log(`  Keeping ${DEMO_ADMIN_EMAIL} — it is the only ADMIN account.`);
      console.log("  Deleting it would lock you out, and there is no password reset flow yet.");
      console.log("  Run `npm run seed` to create the real admin, then re-run this to remove it.");
      console.log("");
      demoAdmin = null;
    }
  }

  if (!clients.length && !demoAdmin) {
    console.log("Nothing to do — no demo clients and no demo admin found.");
    return;
  }

  console.log(confirmed ? "DELETING:" : "DRY RUN — would delete:");
  console.log("");

  for (const c of clients) {
    const [keywords, ranks, reports, grants] = await Promise.all([
      prisma.trackedKeyword.count({ where: { clientId: c.id } }),
      prisma.rankSnapshot.count({ where: { clientId: c.id } }),
      prisma.reportSnapshot.count({ where: { clientId: c.id } }),
      prisma.accessGrant.count({ where: { clientId: c.id } }),
    ]);
    console.log(`  client "${c.name}" (${c.id})`);
    console.log(`    logins            ${c.users.length}  ${c.users.map((u) => u.email).join(", ")}`);
    console.log(`    access grants     ${grants}`);
    console.log(`    tracked keywords  ${keywords}`);
    console.log(`    rank snapshots    ${ranks}`);
    console.log(`    report snapshots  ${reports}`);
  }
  if (demoAdmin) console.log(`  admin login "${DEMO_ADMIN_EMAIL}"`);
  console.log("");

  if (!confirmed) {
    console.log("Re-run with --confirm to delete. Nothing was changed.");
    return;
  }

  for (const c of clients) {
    // Order matters — every child row references clientId, so they go first.
    await prisma.rankSnapshot.deleteMany({ where: { clientId: c.id } });
    await prisma.reportSnapshot.deleteMany({ where: { clientId: c.id } });
    await prisma.trackedKeyword.deleteMany({ where: { clientId: c.id } });
    await prisma.accessGrant.deleteMany({ where: { clientId: c.id } });
    await prisma.user.deleteMany({ where: { clientId: c.id } });
    await prisma.client.delete({ where: { id: c.id } });
    console.log(`Deleted ${c.name}`);
  }

  if (demoAdmin) {
    await prisma.user.delete({ where: { email: DEMO_ADMIN_EMAIL } });
    console.log(`Deleted admin login ${DEMO_ADMIN_EMAIL}`);
  }

  const remaining = await prisma.client.findMany({ select: { name: true } });
  console.log("");
  console.log(`Remaining clients: ${remaining.map((c) => c.name).join(", ") || "(none)"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
