// --------------------------------------------------------------------------
// PDF export — the same data every dashboard section already reads
// (ReportSnapshot/RankSnapshot), laid out as a downloadable client report.
// Uses pdfkit: pure JS, no headless-browser dependency, which matters on
// Vercel serverless — puppeteer/chromium-based PDF generation is heavy
// enough to risk hitting function size/cold-start limits for what's really
// a text-and-tables document, not a pixel-perfect page render.
//
// This never calls a live API — it renders whatever's already sitting in
// the snapshot tables, exactly like the dashboard does. Locked modules
// (not granted in the access ledger) are left out of the PDF entirely,
// same as they're hidden on the dashboard; a granted module with no
// capture yet gets a "not yet captured" line instead of fabricated data.
// --------------------------------------------------------------------------
const PDFDocument = require("pdfkit");

const INK = "#14181D";
const SLATE = "#5C6570";
const TEAL = "#0F6E63";
const AMBER = "#C67C2E";
const LINE = "#DDE1E6";

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function sectionTitle(doc, text) {
  doc.moveDown(1);
  doc.fontSize(13).fillColor(INK).font("Helvetica-Bold").text(text);
  doc.moveTo(doc.x, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).strokeColor(LINE).stroke();
  doc.moveDown(0.6);
}

function notCaptured(doc) {
  doc.fontSize(10).fillColor(SLATE).font("Helvetica-Oblique").text("Not yet captured.");
  doc.font("Helvetica");
}

function statLine(doc, label, value, deltaPct) {
  doc.fontSize(10).fillColor(SLATE).font("Helvetica").text(label, { continued: true });
  doc.fillColor(INK).font("Helvetica-Bold").text(`  ${value}`, { continued: deltaPct != null });
  if (deltaPct != null) {
    const good = deltaPct >= 0;
    doc.fillColor(good ? TEAL : "#B23B3B").font("Helvetica").fontSize(9).text(`  ${good ? "+" : "-"}${Math.abs(deltaPct)}%`);
  }
  doc.font("Helvetica").fillColor(INK);
}

function generateClientReportPdf({ client, access, ga4, keywords, gmb, conversions }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // --- Header ---
    doc.fontSize(9).fillColor(SLATE).font("Helvetica").text("SEO LEDGER \u00b7 NEXIT SOLUTIONS");
    doc.moveDown(0.3);
    doc.fontSize(20).fillColor(INK).font("Helvetica-Bold").text(client.name);
    doc.fontSize(10).fillColor(SLATE).font("Helvetica").text(client.industry);
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(SLATE).text(`Generated ${formatDate(new Date().toISOString())}`);
    doc.moveTo(50, doc.y + 10).lineTo(doc.page.width - 50, doc.y + 10).strokeColor(INK).lineWidth(1.5).stroke();

    // --- Analytics (GA4) ---
    if (access["GA4-01"]) {
      sectionTitle(doc, "Analytics");
      if (!ga4 || ga4.notCapturedYet) {
        notCaptured(doc);
      } else {
        if (ga4.week) {
          doc.fontSize(9).fillColor(SLATE).text(`Week of ${ga4.week.startDate} \u2013 ${ga4.week.endDate} (Mon\u2013Sat)`);
          doc.moveDown(0.4);
        }
        const s = ga4.summary;
        statLine(doc, "Total users", s.totalUsers.value, s.totalUsers.deltaPct); doc.moveDown(0.25);
        statLine(doc, "New users", s.newUsers.value, s.newUsers.deltaPct); doc.moveDown(0.25);
        statLine(doc, "Engaged sessions", s.engagedSessions.value, s.engagedSessions.deltaPct); doc.moveDown(0.25);
        statLine(doc, "Avg. session duration", s.avgSessionDuration.value, null); doc.moveDown(0.25);
        statLine(doc, "Bounce rate", `${s.bounceRate.value}%`, s.bounceRate.deltaPct); doc.moveDown(0.25);
        statLine(doc, "Session key event rate", `${s.sessionKeyEventRate.value}%`, s.sessionKeyEventRate.deltaPct);
        doc.moveDown(0.6);

        doc.fontSize(10).font("Helvetica-Bold").fillColor(INK).text("Top events");
        doc.font("Helvetica").fontSize(9);
        ga4.topEvents.slice(0, 6).forEach((e) => {
          doc.fillColor(SLATE).text(`${e.name}`, { continued: true, width: 300 });
          doc.fillColor(INK).text(`  ${e.count}`, { align: "right" });
        });
        doc.moveDown(0.6);

        doc.fontSize(10).font("Helvetica-Bold").fillColor(INK).text("Landing pages");
        doc.font("Helvetica").fontSize(9);
        ga4.landingPages.slice(0, 6).forEach((p) => {
          doc.fillColor(SLATE).text(`${p.path}`, { continued: true, width: 300 });
          doc.fillColor(INK).text(`  ${p.sessions} sessions, ${p.bounceRate}% bounce`, { align: "right" });
        });
      }
    }

    // --- Keyword rankings ---
    if (access["KWD-02"]) {
      sectionTitle(doc, "Keyword rankings");
      if (!keywords || keywords.tracked.length === 0) {
        doc.fontSize(10).fillColor(SLATE).font("Helvetica-Oblique").text("No keywords tracked.");
        doc.font("Helvetica");
      } else {
        keywords.tracked.forEach((k) => {
          doc.fontSize(10).fillColor(INK).font("Helvetica-Bold").text(k.keyword);
          doc.fontSize(8.5).fillColor(SLATE).font("Helvetica").text(`${k.location} \u00b7 ${k.device}`);
          doc.moveDown(0.15);
          const fmt = (s) => (s && s.position != null ? `#${s.position}` : "\u2014");
          doc.fontSize(9).fillColor(INK).text(
            `DataForSEO: ${fmt(k.sources?.dataforseo)}    Search Console: ${fmt(k.sources?.search_console)}    Manual: ${fmt(k.sources?.manual)}`
          );
          doc.moveDown(0.5);
        });
      }
    }

    // --- Business profile (GMB) ---
    if (access["GMB-03"]) {
      sectionTitle(doc, "Business profile");
      if (!gmb || gmb.notCapturedYet) {
        notCaptured(doc);
      } else {
        statLine(doc, "Profile views", gmb.profileViews, null); doc.moveDown(0.25);
        statLine(doc, "Call clicks", gmb.callClicks, null); doc.moveDown(0.25);
        statLine(doc, "Direction requests", gmb.directionRequests, null); doc.moveDown(0.25);
        statLine(doc, "Website clicks", gmb.websiteClicks, null);
      }
    }

    // --- Conversions ---
    if (access["CNV-04"]) {
      sectionTitle(doc, "Conversions");
      if (!conversions || conversions.notCapturedYet) {
        notCaptured(doc);
      } else {
        conversions.events.forEach((e) => {
          doc.fontSize(9).fillColor(SLATE).text(`${e.name}`, { continued: true, width: 300 });
          doc.fillColor(INK).text(`  ${e.count} (${e.pctOfTotal}%)`, { align: "right" });
        });
      }
    }

    // --- Footer note ---
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor(SLATE).font("Helvetica-Oblique").text(
      "DataForSEO and Search Console figures are captured weekly, not live. Manual entries reflect the last time an admin checked by hand.",
      { width: doc.page.width - 100 }
    );

    doc.end();
  });
}

module.exports = { generateClientReportPdf };
