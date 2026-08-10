// --------------------------------------------------------------------------
// Conversions — captured weekly alongside GA4 (they're GA4 key events under
// the hood, filtered by eventName). Kept as its own module/table because
// it's granted independently in the access ledger — a client can see
// traffic without seeing conversion counts, or vice versa.
// --------------------------------------------------------------------------
const prisma = require("../lib/prisma");

function buildMockPayload() {
  return {
    events: [
      { name: "Thank you", count: 21, pctOfTotal: 77.8 },
      { name: "Call Click", count: 4, pctOfTotal: 14.8 },
      { name: "Email Click", count: 2, pctOfTotal: 7.4 },
    ],
  };
}

async function pollConversionsForClient(client) {
  const payload = buildMockPayload(client);
  return prisma.reportSnapshot.create({
    data: { clientId: client.id, module: "CNV-04", payload },
  });
}

async function getLatestConversionsReport(clientId) {
  const snap = await prisma.reportSnapshot.findFirst({
    where: { clientId, module: "CNV-04" },
    orderBy: { capturedAt: "desc" },
  });
  if (!snap) return null;
  return { ...snap.payload, capturedAt: snap.capturedAt };
}

module.exports = { pollConversionsForClient, getLatestConversionsReport };
