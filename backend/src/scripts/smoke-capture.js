// Exercises pollAllForClient end to end against a stubbed database, with no
// credentials configured — the exact path a freshly-onboarded client takes
// before Google is connected. Everything must fall back to mock rather than
// throw, and every payload must be flagged isMock.
const path = require("path");
const B = path.join(__dirname, "..");

const CLIENT = {
  id: "c1", name: "NexIT", industry: "Managed IT Services",
  ga4PropertyId: "properties/337697913",
  gscSiteUrl: "sc-domain:nexit.com.au",
  websiteUrl: "https://www.nexit.com.au",
};
const KEYWORDS = [
  { id: "k1", clientId: "c1", keyword: "managed it services melbourne",
    location: "Melbourne, Victoria, Australia", device: "mobile", gl: "au", hl: "en" },
];

const written = { report: [], rank: [] };
const prismaStub = {
  client: { findUnique: async () => CLIENT },
  trackedKeyword: { findMany: async () => KEYWORDS },
  reportSnapshot: {
    create: async ({ data }) => { written.report.push(data); return { id: "r" + written.report.length, ...data }; },
    findFirst: async () => null,
  },
  rankSnapshot: {
    create: async ({ data }) => { written.rank.push(data); return { id: "s" + written.rank.length, ...data }; },
    findMany: async () => [], findFirst: async () => null,
  },
  googleConnection: { findMany: async () => [], findFirst: async () => null, update: async () => ({}) },
  accessGrant: { findMany: async () => [] },
};
require.cache[require.resolve(path.join(B, "lib/prisma.js"))] = {
  id: "prisma", filename: "prisma", loaded: true, exports: prismaStub,
};

(async () => {
  const { pollAllForClient } = require(path.join(B, "services/poll.service.js"));
  const result = await pollAllForClient("c1");

  console.log("capture returned:", JSON.stringify(result));
  console.log("report snapshots written:", written.report.length, "-", written.report.map(r => r.module).join(", "));
  console.log("rank snapshots written:  ", written.rank.length, "-", written.rank.map(r => r.source).join(", "));

  const allFlagged = written.report.every(r => r.payload.isMock === true);
  console.log("every report payload flagged isMock:", allFlagged);

  const rankFlagged = written.rank.filter(r => r.source === "serp").every(r => (r.note || "").includes("MOCK"));
  console.log("serp rows carry the mock note:      ", rankFlagged);

  const ga4 = written.report.find(r => r.module === "GA4-01").payload;
  console.log("GA4 daily labels:", ga4.dailyBreakdown.map(d => d.label).join(" "));
  console.log("GA4 week:", ga4.week.startDate, "->", ga4.week.endDate);

  const ok = written.report.length === 3 && written.rank.length >= 1 && allFlagged && rankFlagged;
  console.log(ok ? "\nCAPTURE PATH OK" : "\nCAPTURE PATH PROBLEM");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error("THREW:", e.message); process.exit(1); });
