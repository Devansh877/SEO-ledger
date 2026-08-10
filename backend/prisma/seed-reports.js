// Incremental seed — gives GA4/GMB/Conversions their first captured
// snapshot for the demo clients created by prisma/seed.js, so dashboards
// aren't stuck on "pending first capture" until the next weekly cron run.
// Safe to re-run: skips a client+module that already has a snapshot.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { pollGa4ForClient } = require("../src/services/ga4.service");
const { pollGmbForClient } = require("../src/services/gmb.service");
const { pollConversionsForClient } = require("../src/services/conversions.service");

async function main() {
  const clients = await prisma.client.findMany();

  for (const client of clients) {
    const hasGa4 = await prisma.reportSnapshot.count({ where: { clientId: client.id, module: "GA4-01" } });
    if (!hasGa4) await pollGa4ForClient(client);

    const hasGmb = await prisma.reportSnapshot.count({ where: { clientId: client.id, module: "GMB-03" } });
    if (!hasGmb) await pollGmbForClient(client);

    const hasCnv = await prisma.reportSnapshot.count({ where: { clientId: client.id, module: "CNV-04" } });
    if (!hasCnv) await pollConversionsForClient(client);

    console.log(`Seeded report snapshots for ${client.name}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
