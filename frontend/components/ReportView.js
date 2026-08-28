"use client";
import { useEffect, useState } from "react";
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { Search, MapPin, Download } from "lucide-react";
import { api } from "../lib/api";
import { StatCard, LockedPanel, PendingPanel, ErrorPanel, MockBanner } from "./Primitives";

const PIE_COLORS = ["#0F6E63", "#5C6570", "#C67C2E", "#B23B3B", "#8B95A1", "#DDE1E6"];

function timeAgo(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "captured today";
  if (days === 1) return "captured 1 day ago";
  if (days < 14) return `captured ${days} days ago`;
  return `captured ${Math.floor(days / 7)} weeks ago`;
}

function CapturedNote({ iso }) {
  const label = timeAgo(iso);
  if (!label) return null;
  return <div className="text-[10.5px] text-slate font-mono">{label}</div>;
}

// One column within a keyword's row — current position, change vs the
// previous capture for that specific source, and (for the two automated
// sources) a small trend sparkline. Manual skips the sparkline since it's
// usually a single point, not a weekly series.
function KeywordSourceRow({ label, data, sparkline = true }) {
  if (!data || data.position == null) {
    return (
      <div>
        <div className="text-[10px] text-slate uppercase tracking-wide mb-0.5">{label}</div>
        <div className="font-mono text-[11px] text-line">not yet captured</div>
      </div>
    );
  }

  const hasBoth = data.position != null && data.prevPosition != null;
  const improved = hasBoth && data.position < data.prevPosition;
  const worsened = hasBoth && data.position > data.prevPosition;
  const deltaAbs = hasBoth ? Math.abs(data.position - data.prevPosition) : null;

  return (
    <div>
      <div className="text-[10px] text-slate uppercase tracking-wide mb-0.5">{label}</div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px]">#{data.position}</span>
        <span
          className="font-mono text-[10.5px]"
          style={{ color: improved ? "#0F6E63" : worsened ? "#B23B3B" : "#5C6570" }}
        >
          {hasBoth ? (improved ? `↑${deltaAbs}` : worsened ? `↓${deltaAbs}` : "—") : "new"}
        </span>
      </div>
      {sparkline && data.history && data.history.length > 1 && (
        <ResponsiveContainer width={70} height={20}>
          <LineChart data={data.history}>
            <Line type="monotone" dataKey="position" stroke={worsened ? "#B23B3B" : "#0F6E63"} strokeWidth={1.5} dot={false} />
            {/* reversed Y: lower position number (better rank) renders higher on the sparkline */}
            <YAxis hide reversed domain={["dataMin - 2", "dataMax + 2"]} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {data.searchVolume != null && (
        <div className="text-[10px] text-slate font-mono mt-0.5">vol {data.searchVolume}</div>
      )}
      {data.note && (
        <div className="text-[10px] text-slate italic mt-0.5 truncate" title={data.note}>{data.note}</div>
      )}
    </div>
  );
}

// Renders one client's full report set, respecting the access ledger. Every
// module here reads a stored weekly snapshot (see backend/src/services/) —
// none of the four data sources are ever called live from this component.
// Used identically by the client's own dashboard and by the admin's
// drill-down view — same component, same data, different entry point.
export default function ReportView({ client }) {
  const access = Object.fromEntries((client.access || []).map((a) => [a.module, a.granted]));
  const [ga4, setGa4] = useState(null);
  const [conversions, setConversions] = useState(null);
  const [keywords, setKeywords] = useState(null);
  const [gmb, setGmb] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // A failed request used to fall through to the same UI as "not
    // granted," which made a real bug (bad URL, expired session, backend
    // error) look identical to a permissions issue. Logging + tracking the
    // failure separately means a broken fetch shows up as a visible error
    // instead of a misleading locked stamp.
    if (access["GA4-01"]) {
      api.ga4(client.id).then(setGa4).catch((e) => {
        console.error("GA4 report fetch failed:", e);
        setErrors((x) => ({ ...x, "GA4-01": e.message || "Request failed" }));
      });
    }
    if (access["CNV-04"]) {
      api.conversions(client.id).then(setConversions).catch((e) => {
        console.error("Conversions report fetch failed:", e);
        setErrors((x) => ({ ...x, "CNV-04": e.message || "Request failed" }));
      });
    }
    if (access["KWD-02"]) {
      api.keywords(client.id).then(setKeywords).catch((e) => {
        console.error("Keywords report fetch failed:", e);
        setErrors((x) => ({ ...x, "KWD-02": e.message || "Request failed" }));
      });
    }
    if (access["GMB-03"]) {
      api.gmb(client.id).then(setGmb).catch((e) => {
        console.error("GMB report fetch failed:", e);
        setErrors((x) => ({ ...x, "GMB-03": e.message || "Request failed" }));
      });
    }
    // Re-run whenever the client changes OR any access flag flips — not just
    // on mount. Without the access flags here, toggling a module GRANTED in
    // the ledger updates the stamp instantly but never fetches the data, so
    // the preview kept showing "not yet granted" until a full page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, access["GA4-01"], access["CNV-04"], access["KWD-02"], access["GMB-03"]]);

  const ga4Ready = access["GA4-01"] && ga4 && !ga4.notCapturedYet;
  const ga4Pending = access["GA4-01"] && ga4 && ga4.notCapturedYet;
  const cnvReady = access["CNV-04"] && conversions && !conversions.notCapturedYet;
  const cnvPending = access["CNV-04"] && conversions && conversions.notCapturedYet;
  const gmbReady = access["GMB-03"] && gmb && !gmb.notCapturedYet;
  const gmbPending = access["GMB-03"] && gmb && gmb.notCapturedYet;

  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    setDownloading(true);
    try {
      await api.downloadReportPdf(client.id, client.name);
    } catch (e) {
      console.error("PDF download failed:", e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 text-xs font-medium border border-line rounded px-2.5 py-1.5 hover:bg-paper disabled:opacity-50"
        >
          <Download size={12} />
          {downloading ? "Preparing…" : "Download PDF report"}
        </button>
      </div>
      {ga4Ready ? (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-slate font-mono">
              {ga4.week ? `Week of ${ga4.week.startDate} – ${ga4.week.endDate} (Mon–Sat)` : ""}
            </div>
            <CapturedNote iso={ga4.capturedAt} />
          </div>
          {ga4.isMock && <MockBanner module="Analytics" />}
          <div className="flex gap-3 flex-wrap mb-4">
            <StatCard label="Total users" value={ga4.summary.totalUsers.value} deltaPct={ga4.summary.totalUsers.deltaPct} />
            <StatCard label="New users" value={ga4.summary.newUsers.value} deltaPct={ga4.summary.newUsers.deltaPct} />
            <StatCard label="Engaged sessions" value={ga4.summary.engagedSessions.value} deltaPct={ga4.summary.engagedSessions.deltaPct} />
            <StatCard label="Avg. session duration" value={ga4.summary.avgSessionDuration.value} />
            <StatCard label="Bounce rate" value={`${ga4.summary.bounceRate.value}%`} deltaPct={ga4.summary.bounceRate.deltaPct} positiveIsUp={false} />
            <StatCard label="Session key event rate" value={`${ga4.summary.sessionKeyEventRate.value}%`} deltaPct={ga4.summary.sessionKeyEventRate.deltaPct} />
          </div>

          <div className="card mb-4">
            <div className="font-semibold text-[13px] mb-3">Daily users (Mon–Sat)</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ga4.dailyBreakdown} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#DDE1E6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#5C6570" }} axisLine={{ stroke: "#DDE1E6" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#5C6570" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, border: "1px solid #DDE1E6" }} />
                <Line type="monotone" dataKey="users" stroke="#0F6E63" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="card">
              <div className="font-semibold text-[13px] mb-3">Top events</div>
              {ga4.topEvents.map((e) => (
                <div key={e.name} className="flex items-center gap-2.5 py-1.5 border-b border-line last:border-0 text-[12.5px]">
                  <span className="font-mono flex-1 truncate">{e.name}</span>
                  <div className="w-[70px] h-1.5 bg-paper rounded overflow-hidden shrink-0">
                    <div className="h-full bg-teal" style={{ width: `${Math.min(e.pctEvents * 2.4, 100)}%` }} />
                  </div>
                  <span className="font-mono w-14 text-right">{e.count}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="font-semibold text-[13px] mb-3">Traffic source</div>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={ga4.trafficSource} dataKey="pct" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={1}>
                    {ga4.trafficSource.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2.5 mt-2 text-[11px] text-slate">
                {ga4.trafficSource.map((t, i) => (
                  <div key={t.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="font-mono">{t.pct}%</span> {t.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="font-semibold text-[13px] mb-3">Landing pages</div>
            {ga4.landingPages.map((p) => (
              <div key={p.path} className="flex items-center gap-2.5 py-1.5 border-b border-line last:border-0 text-[12.5px]">
                <span className="flex-1 truncate">{p.path}</span>
                <span className="font-mono w-16 text-right">{p.sessions}</span>
                <span className="font-mono w-16 text-right" style={{ color: p.bounceRate > 60 ? "#B23B3B" : "#14181D" }}>
                  {p.bounceRate}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : ga4Pending ? (
        <PendingPanel title="Analytics" />
      ) : access["GA4-01"] && errors["GA4-01"] ? (
        <ErrorPanel title="Analytics" message={errors["GA4-01"]} />
      ) : (
        <LockedPanel title="Analytics" note="Session, event and landing page data lives here once GA4-01 is granted." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {cnvReady ? (
          <div className="card">
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-semibold text-[13px]">Conversions</div>
              <CapturedNote iso={conversions.capturedAt} />
            </div>
            {conversions.isMock && <MockBanner module="Conversions" />}
            {conversions.events.map((e) => (
              <div key={e.name} className="flex items-center gap-2.5 py-1.5 border-b border-line last:border-0 text-[12.5px]">
                <span className="font-mono flex-1 truncate">{e.name}</span>
                <div className="w-[70px] h-1.5 bg-paper rounded overflow-hidden shrink-0">
                  <div className="h-full bg-amber" style={{ width: `${e.pctOfTotal}%` }} />
                </div>
                <span className="font-mono w-14 text-right">{e.count}</span>
              </div>
            ))}
          </div>
        ) : cnvPending ? (
          <PendingPanel title="Conversions" />
        ) : access["CNV-04"] && errors["CNV-04"] ? (
          <ErrorPanel title="Conversions" message={errors["CNV-04"]} />
        ) : (
          <LockedPanel title="Conversions" note="Call, email and form conversions live here once CNV-04 is granted." />
        )}

        {access["KWD-02"] && keywords ? (
          <div className="card">
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-semibold text-[13px]">Keyword rankings</div>
              <div className="text-[10.5px] text-slate">DataForSEO + Search Console: weekly · Manual: as checked</div>
            </div>
            {keywords.tracked.length === 0 && (
              <div className="text-slate text-[12.5px]">No keywords tracked yet — add some in Settings.</div>
            )}
            {keywords.tracked.map((k) => (
              <div key={k.id || k.keyword} className="py-2.5 border-b border-line last:border-0">
                <div className="text-[12.5px] mb-1.5">
                  <span>{k.keyword}</span>
                  <span className="text-[10.5px] text-slate ml-2">{k.location} · {k.device}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <KeywordSourceRow label="SERP API" data={k.sources?.serp} />
                  <KeywordSourceRow label="Search Console" data={k.sources?.search_console} />
                  <KeywordSourceRow label="Manual" data={k.sources?.manual} sparkline={false} />
                </div>
              </div>
            ))}
          </div>
        ) : access["KWD-02"] && errors["KWD-02"] ? (
          <ErrorPanel icon={<Search size={16} />} title="Keyword rankings" message={errors["KWD-02"]} />
        ) : (
          <LockedPanel icon={<Search size={16} />} title="Keyword rankings" note="Tracked keyword position and search volume live here once KWD-02 is granted." />
        )}
      </div>

      {!access["GMB-03"] && !errors["GMB-03"] && (
        <LockedPanel icon={<MapPin size={16} />} title="Business profile" note="Google Business Profile calls, direction requests and views live here once GMB-03 is granted." />
      )}
      {access["GMB-03"] && errors["GMB-03"] && (
        <ErrorPanel icon={<MapPin size={16} />} title="Business profile" message={errors["GMB-03"]} />
      )}
      {gmbPending && <PendingPanel icon={<MapPin size={16} />} title="Business profile" />}
      {gmbReady && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-semibold text-[13px]">Business profile</div>
            <CapturedNote iso={gmb.capturedAt} />
          </div>
          <div className="flex gap-4 flex-wrap font-mono text-[13px]">
            <div>Profile views: {gmb.profileViews}</div>
            <div>Call clicks: {gmb.callClicks}</div>
            <div>Direction requests: {gmb.directionRequests}</div>
            <div>Website clicks: {gmb.websiteClicks}</div>
          </div>
        </div>
      )}
    </div>
  );
}
