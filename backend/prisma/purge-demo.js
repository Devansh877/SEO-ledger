// Removes the three demo clients (Cyberforte, Meridian Dental, Alderton &
// Co) and the demo admin (admin@nexit.demo), along with every row that
// references them — users, access grants, tracked keywords, rank
// snapshots, report snapshots. Matches ONLY these exact names/emails, so
// it can never catch a real client by accident, even one with a similar
// name.
//
// Dry-run by default — prints what it would delete without touching
// anything. Pass --confirm to actually delete:
//   npm run purge:demo              (dry run)
//   npm run purge:demo -- --confirm (actually deletes)
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEMO_CLIENT_NAMES = ["Cyberforte", "Meridian Dental", "Alderton & Co"];
const DEMO_ADMIN_EMAIL = "admin@nexit.demo";
const DEMO_CLIENT_LOGIN_DOMAIN = "@client.demo"; // cyberforte@client.demo, etc.

async function main() {
  const confirm = process.argv.includes("--confirm");

  const clients = await prisma.client.findMany({
    where: { name: { in: DEMO_CLIENT_NAMES } },
  });
  const clientIds = clients.map((c) => c.id);

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: DEMO_ADMIN_EMAIL },
        { email: { endsWith: DEMO_CLIENT_LOGIN_DOMAIN } },
        { clientId: { in: clientIds } },
      ],
    },
  });

  console.log(confirm ? "Deleting demo data...\n" : "DRY RUN — nothing will be deleted. Pass --confirm to actually delete.\n");

  console.log(`Clients to remove (${clients.length}):`);
  clients.forEach((c) => console.log(`  - ${c.name} (${c.id})`));

  console.log(`\nUsers to remove (${demoUsers.length}):`);
  demoUsers.forEach((u) => console.log(`  - ${u.email} (${u.role})`));

  if (clientIds.length > 0) {
    const [kwCount, rsCount, repCount, agCount] = await Promise.all([
      prisma.trackedKeyword.count({ where: { clientId: { in: clientIds } } }),
      prisma.rankSnapshot.count({ where: { clientId: { in: clientIds } } }),
      prisma.reportSnapshot.count({ where: { clientId: { in: clientIds } } }),
      prisma.accessGrant.count({ where: { clientId: { in: clientIds } } }),
    ]);
    console.log(`\nAlso removes: ${kwCount} tracked keywords, ${rsCount} rank snapshots, ${repCount} report snapshots, ${agCount} access grants.`);
  }

  if (!confirm) {
    console.log("\nNothing deleted. Re-run with --confirm to actually delete this data.");
    return;
  }

  const userIds = demoUsers.map((u) => u.id);
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (clientIds.length > 0) {
    await prisma.trackedKeyword.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.rankSnapshot.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.reportSnapshot.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.accessGrant.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  }

  console.log("\nDone. Demo data removed.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
