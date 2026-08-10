// Vercel's Node.js runtime treats every file under /api as a serverless
// function. This one just re-exports the Express app — vercel.json's
// rewrite sends every request here so Express's own router (mounted at
// /auth, /clients, /access, /reports, not /api/*) still works unchanged.
module.exports = require("../src/index");
