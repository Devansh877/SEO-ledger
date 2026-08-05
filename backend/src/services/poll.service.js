// The single place that captures all four report modules for one client in
// one call — used by the weekly cron job (every client, every module, same
// day) and by the Settings page's "Refresh all reports now" button (one
// client, on demand).
const prisma = require("../lib/prisma");
const { pollGa4ForClient } = require("./ga4.service");
const { pollGmbForClient } = require("./gmb.service");
const { pollConversionsForClient } = require("./conversions.service");
const { pollRankingsForClient } = require("./keywords.service");

async function pollAllForClient(clientId) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const [ga4, gmb, conversions, keywords] = await Promise.all([
    pollGa4ForClient(client),
    pollGmbForClient(client),
    pollConversionsForClient(client),
    pollRankingsForClient(clientId),
  ]);

  return {
    "GA4-01": ga4 ? 1 : 0,
    "GMB-03": gmb ? 1 : 0,
    "CNV-04": conversions ? 1 : 0,
    "KWD-02": keywords.length,
  };
}

module.exports = { pollAllForClient };
