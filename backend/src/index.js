require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const clientRoutes = require("./routes/clients.routes");
const accessRoutes = require("./routes/access.routes");
const reportRoutes = require("./routes/reports.routes");
const settingsRoutes = require("./routes/settings.routes");
const cronRoutes = require("./routes/cron.routes");
const oauthRoutes = require("./routes/oauth.routes");
const integrationRoutes = require("./routes/integrations.routes");

const app = express();
// FRONTEND_URL is the frontend's public URL once deployed. Since the
// frontend's own Next.js server proxies /api/* to us server-side (see
// frontend/next.config.js), the browser never calls this backend directly —
// this CORS rule is a second layer of defense, not the primary boundary.
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/clients", clientRoutes);
app.use("/access", accessRoutes);
app.use("/reports", reportRoutes);
app.use("/settings", settingsRoutes);
app.use("/cron", cronRoutes);
app.use("/oauth", oauthRoutes);
app.use("/integrations", integrationRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

// Catches every error forwarded by asyncHandler (see middleware/asyncHandler.js)
// across all routes above. Without this, an error from any route would be an
// unhandled promise rejection — which crashes the entire Node process, not
// just that one request, taking down every other in-flight request with it.
// This must be defined last, and must take all 4 arguments for Express to
// recognize it as error-handling middleware.
app.use((err, req, res, next) => {
  console.error("Unhandled route error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: "Internal server error",
    message: err.message || "Something went wrong",
  });
});

const PORT = process.env.PORT || 4000;
// On Vercel, this file is imported by api/index.js as a request handler —
// it must not bind a port there. require.main === module is only true when
// you run `node src/index.js` directly (local dev, or a VPS/Hostinger
// Node.js Web App), so app.listen only fires in that case.
if (require.main === module) {
  app.listen(PORT, () => console.log(`SEO Ledger API listening on :${PORT}`));
}

module.exports = app;
