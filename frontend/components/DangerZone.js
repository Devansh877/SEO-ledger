"use client";
import { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";

// Permanent client removal. Gated behind typing the client's name because
// captured history can't be rebuilt: ranking APIs only ever return today's
// position, so deleted RankSnapshot rows take every trend line with them.
export default function DangerZone({ client, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const matches = typed.trim() === client.name;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteClient(client.id, client.name);
      onDeleted && onDeleted(result);
    } catch (err) {
      setError(err.body?.detail || err.message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="card mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-[13px] mb-0.5">Remove client</div>
          <p className="text-slate text-[12.5px] m-0">
            Deletes {client.name}, their login, and all captured history.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-red border border-red/40 rounded px-2.5 py-1.5 hover:bg-red/5 shrink-0"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-5 border-red/40">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle size={15} className="text-red mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-[13px] mb-1">Remove {client.name}?</div>
          <p className="text-slate text-[12.5px] m-0 leading-relaxed">
            This deletes their login, access ledger, tracked keywords, every captured
            report and every ranking snapshot. Rank history can&rsquo;t be rebuilt &mdash;
            SERP APIs only return today&rsquo;s position, so past weeks are gone for good.
          </p>
        </div>
      </div>

      <label className="block text-[11px] text-slate mb-1">
        Type <span className="font-mono text-ink">{client.name}</span> to confirm
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoFocus
        className="w-full border border-line rounded px-3 py-2 text-[12.5px] font-mono mb-3"
        placeholder={client.name}
      />

      {error && <p className="text-red text-[12px] font-mono mb-2">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={!matches || busy}
          className="flex items-center gap-1.5 bg-red text-paper rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {busy ? "Removing…" : "Permanently remove"}
        </button>
        <button
          onClick={() => { setOpen(false); setTyped(""); setError(null); }}
          className="text-xs text-slate font-medium px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
