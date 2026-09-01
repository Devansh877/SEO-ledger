"use client";
import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

function timeAgo(iso) {
  if (!iso) return "never captured";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

// Shows when each of the four report modules was last captured, and (for
// admins) a single button to refresh all of them right now instead of
// waiting for the weekly cron. This is the "options have functionality"
// piece — a real status readout backed by GET /settings/:clientId/status,
// not a static settings screen.
export default function CaptureStatus({ clientId, editable }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function load() {
    api.getStatus(clientId).then(setStatus);
  }
  useEffect(load, [clientId]);

  async function refreshAll() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.refreshAll(clientId);
      setResult(res);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="card text-slate text-sm">Loading capture status\u2026</div>;

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-[13px]">Capture status</div>
        {editable && (
          <button
            onClick={refreshAll}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium bg-ink text-paper rounded px-2.5 py-1.5 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Refresh all reports now
          </button>
        )}
      </div>
      <p className="text-slate text-[12.5px] mb-3">
        All four modules are captured together, weekly \u2014 GA4, Business
        Profile, Conversions and keyword rankings never call their APIs live
        from a dashboard page load.
      </p>

      {result && (
        <div className="flex items-center gap-1.5 text-teal text-xs font-mono mb-3">
          <CheckCircle2 size={13} /> Refreshed just now.
        </div>
      )}

      <div>
        {Object.entries(status).map(([code, s]) => (
          <div key={code} className="flex items-center gap-2.5 py-1.5 border-b border-line last:border-0 text-[12.5px]">
            <span className="font-mono text-slate w-16 shrink-0">{code}</span>
            <span className="flex-1">{s.label}</span>
            <span className="font-mono text-slate">{timeAgo(s.lastCapturedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
