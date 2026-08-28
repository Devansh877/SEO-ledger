"use client";
import { useState, useEffect, useCallback } from "react";
import { Check, Link2, RefreshCw, Unlink, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";

// Connects a client's Google properties and picks which ones this dashboard
// reports on.
//
// This replaces typing raw IDs like "properties/123456789" by hand. After a
// Google account is connected, the app lists what that account can actually
// see and the admin selects from it — so onboarding a client is a dropdown,
// and it's impossible to save an ID the connection can't read.

const PRODUCTS = [
  {
    key: "ga4",
    field: "ga4PropertyId",
    label: "Google Analytics 4",
    note: "Traffic, engagement and conversions.",
  },
  {
    key: "searchConsole",
    field: "gscSiteUrl",
    label: "Search Console",
    note: "Free average-position data, alongside the SERP API's point-in-time rank.",
  },
];

function StatusNote({ children, tone = "slate" }) {
  const colors = { slate: "text-slate", amber: "text-amber", red: "text-red", teal: "text-teal" };
  return <p className={`text-[11.5px] mt-1 m-0 ${colors[tone]}`}>{children}</p>;
}

export default function IntegrationSettings({ client, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.googleProperties(client.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => { load(); }, [load]);

  // The consent screen runs in a popup so the admin doesn't lose this page.
  // Google redirects back to the backend, which redirects to /dashboard/settings —
  // polling for the popup closing is what tells us to refresh.
  async function connect(scope) {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.startGoogleConnect(scope === "client" ? client.id : null);
      const popup = window.open(url, "google-connect", "width=520,height=680");
      if (!popup) {
        setError("Popup blocked. Allow popups for this site and try again.");
        setConnecting(false);
        return;
      }
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setConnecting(false);
          load();
        }
      }, 600);
    } catch (err) {
      // A 503 here means the server is missing OAuth config, and the detail
      // says which variable — worth showing verbatim rather than "failed".
      setError(err.body?.detail || err.message);
      setConnecting(false);
    }
  }

  async function disconnect(id) {
    await api.removeGoogleConnection(id);
    load();
  }

  async function select(field, value, extra = {}) {
    setSaving(true);
    try {
      const updated = await api.saveGoogleSelection(client.id, { [field]: value || null, ...extra });
      setData((d) => ({ ...d, selected: { ...d.selected, ...updated } }));
      onSaved && onSaved({ ...client, ...updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card mb-5 flex items-center gap-2 text-slate text-[12.5px]">
        <Loader2 size={13} className="animate-spin" /> Checking Google connection&hellip;
      </div>
    );
  }

  const connections = data?.connections || [];
  const hasLive = data?.connected;

  return (
    <div className="card mb-5">
      <div className="flex items-center justify-between mb-1 gap-3">
        <div className="font-semibold text-[13px]">Google connection</div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-teal text-[11px]"><Check size={11} className="inline" /> Saved</span>}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-medium border border-line rounded px-2.5 py-1.5 hover:bg-paper"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      <p className="text-slate text-[12.5px] mb-3 m-0">
        Sign in once with a Google account that can see this client&rsquo;s properties.
        Everything it can read becomes selectable below &mdash; no property IDs to copy.
      </p>

      {error && (
        <div className="border border-red/40 bg-red/5 rounded p-2.5 mb-3">
          <div className="text-red text-[12px] flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Existing connections */}
      {connections.length > 0 && (
        <div className="border border-line rounded mb-3 divide-y divide-line">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-[12px] truncate">{c.email}</div>
                <div className="text-[11px] text-slate">
                  {c.scope === "agency" ? "Agency-wide · usable for every client" : "Connected for this client"}
                </div>
                {c.status !== "active" && (
                  <StatusNote tone="red">
                    Needs reconnecting{c.lastError ? ` — ${c.lastError}` : ""}
                  </StatusNote>
                )}
              </div>
              <button
                onClick={() => disconnect(c.id)}
                title="Remove stored credentials"
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate border border-line rounded px-2 py-1 hover:bg-paper shrink-0"
              >
                <Unlink size={11} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => connect("client")}
          disabled={connecting}
          className="flex items-center gap-1.5 bg-ink text-paper rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
          {connections.length ? "Connect another account" : "Connect Google"}
        </button>
        <button
          onClick={() => connect("agency")}
          disabled={connecting}
          className="flex items-center gap-1.5 border border-line rounded px-3 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50"
        >
          <Link2 size={12} /> Connect as agency
        </button>
      </div>

      {/* Property pickers */}
      {!hasLive ? (
        <p className="text-slate text-[12.5px] m-0">
          Nothing connected yet &mdash; this client&rsquo;s captures will keep using mock data.
        </p>
      ) : (
        <div className="space-y-3">
          {PRODUCTS.map(({ key, field, label, note }) => {
            const result = data[key] || { status: "empty", items: [] };
            const selected = data.selected?.[field] || "";
            const missing = selected && result.status === "ok" && !result.items.some((i) => i.id === selected);

            return (
              <div key={key}>
                <label className="block text-[11px] text-slate mb-1 font-semibold uppercase tracking-wide">
                  {label}
                </label>

                {result.status === "ok" ? (
                  <select
                    value={selected}
                    disabled={saving}
                    onChange={(e) => {
                      const item = result.items.find((i) => i.id === e.target.value);
                      // Business Profile would also need its account id; GA4
                      // and Search Console are identified by one value each.
                      select(field, e.target.value, item?.accountId ? { gmbAccountId: item.accountId } : {});
                    }}
                    className="w-full border border-line rounded px-3 py-2 text-[12.5px] bg-surface disabled:opacity-50"
                  >
                    <option value="">Not selected &mdash; this module uses mock data</option>
                    {result.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}{i.group ? ` — ${i.group}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="border border-line rounded px-3 py-2 text-[12px] text-slate bg-paper">
                    {result.status === "empty"
                      ? "The connected account can't see any of these."
                      : result.error || "Couldn't list these."}
                  </div>
                )}

                <StatusNote tone={missing ? "red" : "slate"}>
                  {missing
                    ? `Currently set to "${selected}", which the connected account cannot read. Pick one from the list.`
                    : note}
                </StatusNote>
              </div>
            );
          })}

          <div>
            <label className="block text-[11px] text-slate mb-1 font-semibold uppercase tracking-wide">
              Business Profile
            </label>
            <div className="border border-line rounded px-3 py-2 text-[12px] text-slate bg-paper">
              Not enabled in this version.
            </div>
            <StatusNote tone="amber">
              Keep GMB-03 locked in the Access Ledger &mdash; it still returns placeholder numbers.
            </StatusNote>
          </div>
        </div>
      )}
    </div>
  );
}
