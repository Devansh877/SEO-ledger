"use client";
import { useState } from "react";
import { Check, PenLine } from "lucide-react";
import { api } from "../lib/api";

// Attaches the real GA4 property / GMB location / Search Console site for
// one client — this is what switches that client's captures from mock
// data to real API calls (see ga4.service.js / gsc.service.js), with no
// other code changes needed once these are filled in and the service
// account has been granted access on each property.
export default function IntegrationSettings({ client, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [ga4PropertyId, setGa4PropertyId] = useState(client.ga4PropertyId || "");
  const [gmbLocationId, setGmbLocationId] = useState(client.gmbLocationId || "");
  const [gscSiteUrl, setGscSiteUrl] = useState(client.gscSiteUrl || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.updateClient(client.id, { ga4PropertyId, gmbLocationId, gscSiteUrl });
      onSaved && onSaved(updated);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  const configuredCount = [client.ga4PropertyId, client.gmbLocationId, client.gscSiteUrl].filter(Boolean).length;

  return (
    <div className="card mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-[13px]">Real data source IDs</div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs font-medium border border-line rounded px-2.5 py-1.5 hover:bg-paper"
          >
            <PenLine size={11} /> Edit
          </button>
        )}
      </div>
      <p className="text-slate text-[12.5px] mb-3">
        Without these, captures use mock data. Once set, GA4 and Search
        Console pull real data automatically \u2014 make sure the service
        account has Viewer access on each actual property first.
        {saved && <span className="text-teal ml-2"><Check size={11} className="inline" /> Saved</span>}
      </p>

      {editing ? (
        <form onSubmit={save} className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate mb-1">GA4 property ID</label>
              <input value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-[12.5px] font-mono" placeholder="properties/123..." />
            </div>
            <div>
              <label className="block text-[11px] text-slate mb-1">GMB location ID</label>
              <input value={gmbLocationId} onChange={(e) => setGmbLocationId(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-[12.5px] font-mono" placeholder="locations/123..." />
            </div>
            <div>
              <label className="block text-[11px] text-slate mb-1">Search Console site</label>
              <input value={gscSiteUrl} onChange={(e) => setGscSiteUrl(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-[12.5px] font-mono" placeholder="https://site.com.au/" />
            </div>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} className="bg-ink text-paper rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              {busy ? "Saving\u2026" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate font-medium px-3 py-1.5">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="font-mono text-[12px] space-y-1">
          <div>GA4: {client.ga4PropertyId || <span className="text-line">not set \u2014 using mock</span>}</div>
          <div>GMB: {client.gmbLocationId || <span className="text-line">not set \u2014 using mock</span>}</div>
          <div>Search Console: {client.gscSiteUrl || <span className="text-line">not set \u2014 using mock</span>}</div>
          {configuredCount > 0 && (
            <div className="text-teal text-[11px] pt-1">{configuredCount} of 3 configured</div>
          )}
        </div>
      )}
    </div>
  );
}
