// --------------------------------------------------------------------------
// Google Business Profile — captured weekly, not called live from a
// dashboard load. Real API implementation point: pollGmbForClient() is
// where the Business Profile Performance API call
// (businessprofileperformance.googleapis.com) would go, using the client's
// gmbLocationId and a per-client OAuth grant.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");

// Business Profile is deferred to a later version — there is no API client
// here yet, so every value below is invented. isMock keeps that visible all
// the way through to the dashboard and PDF. GMB-03 should stay LOCKED in
// the access ledger until this is real.
function buildMockPayload() {
  return {
    isMock: true,
    profileViews: 412,
    searchViews: 298,
    mapViews: 114,
    callClicks: 4,
    directionRequests: 11,
    websiteClicks: 22,
  };
}

async function pollGmbForClient(client) {
  const payload = buildMockPayload(client);
  return prisma.reportSnapshot.create({
    data: { clientId: client.id, module: "GMB-03", payload },
  });
}

async function getLatestGmbReport(clientId) {
  const snap = await prisma.reportSnapshot.findFirst({
    where: { clientId, module: "GMB-03" },
    orderBy: { capturedAt: "desc" },
  });
  if (!snap) return null;
  return { ...snap.payload, capturedAt: snap.capturedAt };
}

module.exports = { pollGmbForClient, getLatestGmbReport };
