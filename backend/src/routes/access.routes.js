const express = require("express");
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));

// PUT /access/:clientId/:module  { granted: true|false }
// The single mutation behind the whole permission system: admin stamps a
// module GRANTED or LOCKED for one client. Everything downstream
// (checkAccess middleware, client dashboard rendering) reads this table.
router.put("/:clientId/:module", asyncHandler(async (req, res) => {
  const { clientId, module } = req.params;
  const { granted } = req.body;

  const grant = await prisma.accessGrant.upsert({
    where: { clientId_module: { clientId, module } },
    update: { granted: !!granted },
    create: { clientId, module, granted: !!granted },
  });
  res.json(grant);
}));

module.exports = router;
