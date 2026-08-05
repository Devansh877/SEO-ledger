// Seeds one admin user + three demo clients, each with their own login
// and an access ledger row per report module.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];

const CLIENTS = [
  {
    name: "Cyberforte",
    industry: "Cybersecurity",
    email: "cyberforte@client.demo",
    ga4PropertyId: "properties/000000001",
    gmbLocationId: "locations/1001",
    access: { "GA4-01": true, "KWD-02": true, "GMB-03": false, "CNV-04": true },
  },
  {
    name: "Meridian Dental",
    industry: "Healthcare",
    email: "meridian@client.demo",
    ga4PropertyId: "properties/000000002",
    gmbLocationId: "locations/1002",
    access: { "GA4-01": true, "KWD-02": true, "GMB-03": true, "CNV-04": true },
  },
  {
    name: "Alderton & Co",
    industry: "Legal",
    email: "alderton@client.demo",
    ga4PropertyId: "properties/000000003",
    gmbLocationId: "locations/1003",
    access: { "GA4-01": true, "KWD-02": false, "GMB-03": false, "CNV-04": false },
  },
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@nexit.demo" },
    update: {},
    create: { email: "admin@nexit.demo", passwordHash, role: "ADMIN" },
  });
  console.log("Admin login: admin@nexit.demo / password123");

  for (const c of CLIENTS) {
    const client = await prisma.client.create({
      data: {
        name: c.name,
        industry: c.industry,
        ga4PropertyId: c.ga4PropertyId,
        gmbLocationId: c.gmbLocationId,
        access: {
          create: MODULES.map((m) => ({ module: m, granted: !!c.access[m] })),
        },
      },
    });

    await prisma.user.create({
      data: {
        email: c.email,
        passwordHash,
        role: "CLIENT",
        clientId: client.id,
      },
    });
    console.log(`Client login: ${c.email} / password123`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
