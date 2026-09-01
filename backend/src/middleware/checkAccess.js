const prisma = require("../lib/prisma");

// Gate a report route by the access ledger. Admins bypass the check
// (they can preview any client's reports); a CLIENT user can only
// reach report modules that have been granted to their own client.
module.exports = function checkAccess(moduleCode) {
  return async (req, res, next) => {
    try {
      const clientId = req.params.clientId;

      if (req.user.role === "ADMIN") return next();

      if (req.user.role === "CLIENT" && req.user.clientId !== clientId) {
        return res.status(403).json({ error: "Not your dashboard" });
      }

      const grant = await prisma.accessGrant.findUnique({
        where: { clientId_module: { clientId, module: moduleCode } },
      });

      if (!grant || !grant.granted) {
        return res.status(403).json({
          error: "Module not granted",
          module: moduleCode,
          locked: true,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
