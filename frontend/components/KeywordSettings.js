"use client";
import { useEffect, useState } from "react";
import { Plus, X, RefreshCw, MapPin, Smartphone, Monitor, PenLine } from "lucide-react";
import { api } from "../lib/api";

const DEFAULT_LOCATION = "Melbourne, Victoria, Australia";

const SOURCE_LABELS = {
  serp: "SERP API",
  search_console: "Search Console",
  manual: "Manual",
};

function timeAgo(iso) {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

function ManualEntryForm({ clientId, keywordId, onSaved, onCancel }) {
  const [position, setPosition] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!position) return;
    setBusy(true);
    try {
      await api.addManualRanking(clientId, keywordId, Number(position), null, note.trim() || undefined);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5 mt-1.5">
      <input
        type="number"
        min="1"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        placeholder="Position #"
        className="w-20 border border-line rounded px-2 py-1 text-[11.5px]"
        autoFocus
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="flex-1 border border-line rounded px-2 py-1 text-[11.5px]"
      />
      <button disabled={busy || !position} className="bg-ink text-paper rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={onCancel} className="text-slate text-[11px]">Cancel</button>
    </form>
  );
}

function SourceCell({ label, data }) {
  if (!data) {
    return (
      <div className="text-[11px]">
        <div className="text-slate">{label}</div>
        <div className="font-mono text-line">—</div>
      </div>
    );
  }
  return (
    <div className="text-[11px]">
      <div className="text-slate">{label}</div>
      <div className="font-mono">#{data.position}</div>
      <div className="text-[10px] text-slate">{timeAgo(data.capturedAt)}</div>
    </div>
  );
}

// The functional Settings panel: admin can add/remove tracked keywords,
// force an immediate automated refresh, and log a manual ranking they
// checked by hand; a client sees the same list read-only. Every keyword
// shows all three sources side by side rather than collapsing to one
// number — DataForSEO and Search Console are automated (weekly), manual is
// whatever an admin last typed in (most accurate, but not on a schedule).
export default function KeywordSettings({ clientId, editable }) {
  const [keywords, setKeywords] = useState(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [newLocation, setNewLocation] = useState(DEFAULT_LOCATION);
  const [newDevice, setNewDevice] = useState("mobile");
  const [busy, setBusy] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [manualEntryFor, setManualEntryFor] = useState(null);

  function load() {
    api.listTrackedKeywords(clientId).then(setKeywords);
  }
  useEffect(load, [clientId]);

  async function addKeyword(e) {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    setBusy(true);
    try {
      await api.addTrackedKeyword(clientId, newKeyword.trim(), newLocation.trim() || DEFAULT_LOCATION, newDevice);
      setNewKeyword("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeKeyword(id) {
    setBusy(true);
    try {
      await api.removeTrackedKeyword(clientId, id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function refreshNow() {
    setBusy(true);
    setRefreshResult(null);
    try {
      const res = await api.refreshKeywords(clientId);
      setRefreshResult(res);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!keywords) return <div className="card text-slate text-sm">Loading keyword settings…</div>;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-[13px]">Tracked keywords</div>
        {editable && (
          <button
            onClick={refreshNow}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium border border-line rounded px-2.5 py-1.5 hover:bg-paper disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Refresh automated sources
          </button>
        )}
      </div>
      <p className="text-slate text-[12.5px] mb-3">
        DataForSEO and Search Console update weekly, automatically. Manual is
        whatever an admin last checked by hand — most accurate, but only
        as fresh as someone did it (expect roughly monthly, not weekly).
      </p>

      {refreshResult && (
        <div className="text-teal text-xs font-mono mb-3">
          Captured {refreshResult.refreshed} automated snapshot{refreshResult.refreshed === 1 ? "" : "s"} just now.
        </div>
      )}

      {keywords.length === 0 && (
        <div className="text-slate text-[12.5px] mb-3">No keywords tracked yet.</div>
      )}

      <div className="mb-3">
        {keywords.map((k) => (
          <div key={k.id} className="py-2.5 border-b border-line last:border-0 text-[12.5px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div>{k.keyword}</div>
                <div className="flex items-center gap-2.5 text-[10.5px] text-slate mt-0.5">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {k.location}</span>
                  <span className="flex items-center gap-1">
                    {k.device === "desktop" ? <Monitor size={10} /> : <Smartphone size={10} />} {k.device}
                  </span>
                </div>
              </div>
              {editable && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setManualEntryFor(manualEntryFor === k.id ? null : k.id)}
                    className="flex items-center gap-1 text-[11px] font-medium border border-line rounded px-2 py-1 hover:bg-paper"
                    title="Log a ranking you checked by hand"
                  >
                    <PenLine size={11} /> Add manual
                  </button>
                  <button
                    onClick={() => removeKeyword(k.id)}
                    disabled={busy}
                    className="text-slate hover:text-red disabled:opacity-50"
                    title="Stop tracking"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-5 mt-2">
              <SourceCell label={SOURCE_LABELS.serp} data={k.sources?.serp} />
              <SourceCell label={SOURCE_LABELS.search_console} data={k.sources?.search_console} />
              <SourceCell label={SOURCE_LABELS.manual} data={k.sources?.manual} />
            </div>

            {manualEntryFor === k.id && (
              <ManualEntryForm
                clientId={clientId}
                keywordId={k.id}
                onSaved={() => { setManualEntryFor(null); load(); }}
                onCancel={() => setManualEntryFor(null)}
              />
            )}
          </div>
        ))}
      </div>

      {editable && (
        <form onSubmit={addKeyword} className="space-y-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Keyword to track…"
            className="w-full border border-line rounded px-3 py-2 text-[12.5px]"
          />
          <div className="flex gap-2">
            <input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder={DEFAULT_LOCATION}
              className="flex-1 border border-line rounded px-3 py-2 text-[12.5px]"
              title="Location to simulate the search from — Google localizes results by geography"
            />
            <select
              value={newDevice}
              onChange={(e) => setNewDevice(e.target.value)}
              className="border border-line rounded px-2 py-2 text-[12.5px] bg-surface"
              title="Device to simulate — mobile and desktop rankings can differ"
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
            <button
              disabled={busy || !newKeyword.trim()}
              className="flex items-center gap-1 bg-ink text-paper rounded px-3 py-2 text-xs font-medium disabled:opacity-50 shrink-0"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
