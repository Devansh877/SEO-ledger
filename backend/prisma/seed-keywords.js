// Incremental seed — adds tracked keywords + ~10 weeks of rank history to
// the demo clients created by prisma/seed.js. All seeded against Melbourne,
// Victoria, Australia on mobile, gl "au" / hl "en" (matches the defaults
// new keywords get from the Settings page if you don't override them).
// Seeds history for both automated sources (dataforseo, search_console)
// plus one manual entry per keyword, so the dashboard's three-source
// layout has something in every column immediately. Safe to re-run:
// keywords are upserted, and history is only generated for a (client,
// keyword, location, device) combination that doesn't already have any
// snapshots for a given source.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const LOCATION = "Melbourne, Victoria, Australia";
const DEVICE = "mobile";
const GL = "au";
const HL = "en";

const KEYWORDS_BY_CLIENT = {
  "Cyberforte": [
    "penetration testing brisbane",
    "iso 27001 certification australia",
    "soc 2 compliance australia",
    "cyber security consultant melbourne",
  ],
  "Meridian Dental": [
    "dentist near me",
    "emergency dental clinic",
    "teeth whitening prices",
  ],
  "Alderton & Co": [
    "commercial lawyer melbourne",
    "contract dispute solicitor",
  ],
};

const WEEKS = 10;

function randomWalk(startPos) {
  // Produces a plausible ranking history ending near startPos, oldest first.
  const history = [];
  let pos = startPos + Math.floor(Math.random() * 10) - 5;
  pos = Math.max(1, pos);
  for (let i = 0; i < WEEKS; i++) {
    pos = Math.max(1, pos + Math.floor(Math.random() * 5) - 2);
    history.push(pos);
  }
  history[history.length - 1] = startPos; // land exactly on the "current" value
  return history;
}

async function seedSourceHistory(clientId, keyword, source, hasSearchVolume) {
  const existing = await prisma.rankSnapshot.count({
    where: { clientId, keyword, location: LOCATION, device: DEVICE, source },
  });
  if (existing > 0) return; // already has history for this source, don't duplicate

  const finalPosition = 3 + Math.floor(Math.random() * 15);
  const positions = randomWalk(finalPosition);
  const now = Date.now();

  for (let i = 0; i < WEEKS; i++) {
    const daysAgo = (WEEKS - 1 - i) * 7;
    await prisma.rankSnapshot.create({
      data: {
        clientId,
        keyword,
        location: LOCATION,
        device: DEVICE,
        source,
        position: positions[i],
        searchVolume: hasSearchVolume ? 100 + Math.floor(Math.random() * 400) : null,
        capturedAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }
}

async function main() {
  for (const [clientName, keywords] of Object.entries(KEYWORDS_BY_CLIENT)) {
    const client = await prisma.client.findFirst({ where: { name: clientName } });
    if (!client) {
      console.log(`Skipping ${clientName} — not found (run prisma/seed.js first)`);
      continue;
    }

    for (const keyword of keywords) {
      await prisma.trackedKeyword.upsert({
        where: {
          clientId_keyword_location_device_gl_hl: {
            clientId: client.id,
            keyword,
            location: LOCATION,
            device: DEVICE,
            gl: GL,
            hl: HL,
          },
        },
        update: {},
        create: { clientId: client.id, keyword, location: LOCATION, device: DEVICE, gl: GL, hl: HL },
      });

      // Automated sources get a full weekly history.
      await seedSourceHistory(client.id, keyword, "dataforseo", true);
      await seedSourceHistory(client.id, keyword, "search_console", false);

      // Manual gets exactly one entry (roughly monthly cadence in reality,
      // not a 10-week backfill) — only if none exists yet.
      const hasManual = await prisma.rankSnapshot.count({
        where: { clientId: client.id, keyword, location: LOCATION, device: DEVICE, source: "manual" },
      });
      if (!hasManual) {
        await prisma.rankSnapshot.create({
          data: {
            clientId: client.id,
            keyword,
            location: LOCATION,
            device: DEVICE,
            source: "manual",
            position: 3 + Math.floor(Math.random() * 15),
            searchVolume: null,
            note: "Seeded demo entry — checked via incognito",
          },
        });
      }
    }
    console.log(`Seeded keyword history for ${clientName}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
