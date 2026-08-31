"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { Rail, TopBar } from "../../components/TopBar";
import { Stamp, StatCard } from "../../components/Primitives";
import ReportView from "../../components/ReportView";
import PasswordGate from "../../components/PasswordGate";

const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <PasswordGate>
      {user.role === "ADMIN" ? <AdminRoster /> : <OwnClientDashboard clientId={user.clientId} />}
    </PasswordGate>
  );
}

function AdminRoster() {
  const [clients, setClients] = useState(null);
  const [fetchingId, setFetchingId] = useState(null);
  const [justFetchedId, setJustFetchedId] = useState(null);
  const router = useRouter();

  function load() {
    api.listClients().then(setClients);
  }
  useEffect(load, []);

  async function fetchNow(e, clientId) {
    e.stopPropagation(); // don't trigger the row's own navigation
    setFetchingId(clientId);
    setJustFetchedId(null);
    try {
      await api.refreshAll(clientId);
      setJustFetchedId(clientId);
      setTimeout(() => setJustFetchedId(null), 4000);
    } finally {
      setFetchingId(null);
    }
  }

  if (!clients) return <Shell><div className="p-8 text-slate text-sm">Loading roster…</div></Shell>;

  const grantedCount = clients.reduce((s, c) => s + c.access.filter((a) => a.granted).length, 0);
  const possible = clients.length * MODULES.length;

  return (
    <Shell>
      <div className="max-w-[1080px] mx-auto px-8 py-7">
        <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Admin · Overview</div>
        <h1 className="text-xl font-semibold mb-1">Client roster</h1>
        <p className="text-slate text-[13px] max-w-[560px] mb-5 leading-relaxed">
          Every module a client can see is granted here first. Data is captured
          every Sunday, covering the week just completed — use{" "}
          <span className="font-mono">Fetch now</span> below to pull a
          client's data on demand instead of waiting for the next cycle.
        </p>

        <div className="flex gap-3 flex-wrap mb-5">
          <StatCard label="Active clients" value={clients.length} />
          <StatCard label="Modules granted" value={`${grantedCount} / ${possible}`} />
        </div>

        <div className="card p-0 overflow-hidden">
          {clients.map((c) => {
            const access = Object.fromEntries(c.access.map((a) => [a.module, a.granted]));
            const busy = fetchingId === c.id;
            const justDone = justFetchedId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-line last:border-0 hover:bg-paper text-left cursor-pointer"
              >
                <span className="w-7 h-7 rounded bg-paper border border-line flex items-center justify-center">
                  <Building2 size={14} strokeWidth={2} />
                </span>
                <span className="flex-1">
                  <div className="font-semibold text-[13px]">{c.name}</div>
                  <div className="text-[11px] text-slate">{c.industry}</div>
                </span>
                <span className="hidden md:flex gap-1.5 flex-wrap justify-end">
                  {MODULES.map((m) => (
                    <Stamp key={m} granted={access[m]} />
                  ))}
                </span>
                <button
                  onClick={(e) => fetchNow(e, c.id)}
                  disabled={busy}
                  title="Fetch this client's data now, instead of waiting for Sunday"
                  className={`flex items-center gap-1.5 text-xs font-medium border rounded px-2.5 py-1.5 shrink-0 disabled:opacity-50 ${
                    justDone ? "border-teal text-teal" : "border-line hover:bg-surface"
                  }`}
                >
                  {justDone ? <CheckCircle2 size={12} /> : <RefreshCw size={12} className={busy ? "animate-spin" : ""} />}
                  {justDone ? "Fetched" : "Fetch now"}
                </button>
                <ChevronRight size={16} className="text-slate shrink-0" />
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function OwnClientDashboard({ clientId }) {
  const [client, setClient] = useState(null);
  useEffect(() => { api.getClient(clientId).then(setClient); }, [clientId]);

  if (!client) return <Shell><div className="p-8 text-slate text-sm">Loading dashboard…</div></Shell>;

  return (
    <Shell>
      <div className="max-w-[1080px] mx-auto px-8 py-7">
        <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Client dashboard</div>
        <h1 className="text-xl font-semibold mb-5">{client.name}</h1>
        <ReportView client={client} />
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen flex">
      <Rail />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
