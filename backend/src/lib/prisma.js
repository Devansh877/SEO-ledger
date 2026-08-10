const { PrismaClient } = require("@prisma/client");

// Serverless functions can spin up many concurrent instances; without this,
// each one opens its own connection pool and you exhaust the database's
// connection limit fast. Caching on `global` means warm invocations reuse
// the same client instead of creating a new one every time.
const globalForPrisma = global;
const prisma = globalForPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

module.exports = prisma;
