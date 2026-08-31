// Optional transactional email, used only for password reset links.
//
// Deliberately optional. A small agency onboarding a handful of clients can
// run this entire platform without an email provider: an admin resets a
// client's password from the dashboard and passes the new one on directly.
// Self-service "forgot password" is the only feature that needs SMTP, and
// when it isn't configured the endpoint says so rather than accepting the
// request and silently dropping the message.
//
// Configure with any SMTP provider:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
const nodemailer = require("nodemailer");

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let cachedTransport = null;
function getTransport() {
  if (!isConfigured()) return null;
  if (cachedTransport) return cachedTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS after connecting.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

async function sendPasswordReset({ to, resetUrl, expiresInMinutes }) {
  const transport = getTransport();
  if (!transport) return { sent: false, reason: "smtp_not_configured" };

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({
    from,
    to,
    subject: "Reset your SEO Ledger password",
    text: [
      "You asked to reset your SEO Ledger password.",
      "",
      `Open this link to choose a new one (expires in ${expiresInMinutes} minutes):`,
      resetUrl,
      "",
      "If you didn't request this, you can ignore this message — your password hasn't changed.",
    ].join("\n"),
  });
  return { sent: true };
}

async function verify() {
  const transport = getTransport();
  if (!transport) return { ok: false, reason: "smtp_not_configured" };
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendPasswordReset, verify };
