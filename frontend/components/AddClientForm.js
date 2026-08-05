"use client";
import { useState } from "react";
import { Plus, Copy, CheckCircle2, X } from "lucide-react";
import { api } from "../lib/api";

// Onboards a new client: creates the Client record, a blank access ledger
// (nothing granted until an admin stamps it — same as any other client),
// and a CLIENT-role login. The temporary password is only ever shown once,
// right here, right after creation — the backend never returns it again on
// any later request, so this is the one moment to copy it somewhere safe.
export default function AddClientForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [email, setEmail] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [gmbLocationId, setGmbLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null); // { loginEmail, temporaryPassword, client }
  const [copied, setCopied] = useState(false);

  function reset() {
    setName(""); setIndustry(""); setEmail(""); setGa4PropertyId(""); setGmbLocationId("");
    setError(null); setCreated(null); setCopied(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.createClient({
        name, industry, email,
        ga4PropertyId: ga4PropertyId || undefined,
        gmbLocationId: gmbLocationId || undefined,
      });
      setCreated(res);
      onCreated && onCreated(res.client);
    } catch (err) {
      setError(err.body?.error || "Couldn't create client");
    } finally {
      setBusy(false);
    }
  }

  function copyCredentials() {
    const text = `Login: ${created.loginEmail}\nTemporary password: ${created.temporaryPassword}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-ink text-paper rounded px-3 py-2 text-xs font-medium"
      >
        <Plus size={13} /> Add client
      </button>
    );
  }

  // Success state: show the one-time credentials, nothing else.
  if (created) {
    return (
      <div className="card border-teal/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-teal font-semibold text-[13px]">
            <CheckCircle2 size={15} /> {created.client.name} created
          </div>
          <button onClick={() => { setOpen(false); reset(); }} className="text-slate hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <p className="text-slate text-[12.5px] mb-3">
          This is the only time the password is shown \u2014 it can't be
          retrieved again after you close this. Copy it to your client
          onboarding notes now.
        </p>
        <div className="bg-paper border border-line rounded p-3 font-mono text-[12.5px] mb-3">
          <div>Login: {created.loginEmail}</div>
          <div>Password: {created.temporaryPassword}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyCredentials}
            className="flex items-center gap-1.5 border border-line rounded px-3 py-1.5 text-xs font-medium hover:bg-paper"
          >
            {copied ? <CheckCircle2 size={12} className="text-teal" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy credentials"}
          </button>
          <button
            onClick={() => { setOpen(false); reset(); }}
            className="text-xs font-medium text-slate px-3 py-1.5"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-[13px]">Add client</div>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-slate hover:text-ink">
          <X size={15} />
        </button>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="block text-[11px] text-slate mb-1">Client name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full border border-line rounded px-3 py-2 text-[12.5px]" placeholder="e.g. Meridian Dental" />
        </div>
        <div>
          <label className="block text-[11px] text-slate mb-1">Industry</label>
          <input value={industry} onChange={(e) => setIndustry(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-[12.5px]" placeholder="e.g. Healthcare" />
        </div>
        <div>
          <label className="block text-[11px] text-slate mb-1">Client login email *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full border border-line rounded px-3 py-2 text-[12.5px]" placeholder="client@theirdomain.com" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
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
        </div>
      </div>

      {error && <div className="text-red text-xs font-mono mt-3">{error}</div>}

      <div className="flex gap-2 mt-4">
        <button disabled={busy} className="bg-ink text-paper rounded px-4 py-2 text-xs font-medium disabled:opacity-50">
          {busy ? "Creating\u2026" : "Create client"}
        </button>
        <p className="text-[11px] text-slate self-center">
          Starts with nothing granted \u2014 stamp access from the client's detail page after.
        </p>
      </div>
    </form>
  );
}
