"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Download } from "lucide-react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { Rail, TopBar } from "../../../components/TopBar";
import { Stamp, StatCard } from "../../../components/Primitives";
import AddClientForm from "../../../components/AddClientForm";

const MODULES = ["GA4-01", "KWD-02", "GMB-03", "CNV-04"];

// Client management: onboard new clients here, distinct from the Overview
// roster (which is the fast day-to-day glance + per-client fetch). This
// page is for the less-frequent "bring a new client on" action, so it
// doesn't get lost among the daily-use controls on Overview.
export default function ClientsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) router.replace("/dashboard");
  }, [loading, user, router]);

  function load() {
    api.listClients().then(setClients);
  }
  useEffect(load, []);

  async function downloadPdf(e, client) {
    e.stopPropagation();
    setDownloadingId(client.id);
    try {
      await api.downloadReportPdf(client.id, client.name);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading || !user || user.role !== "ADMIN") return null;

  return (
    <div className="min-h-screen flex">
      <Rail />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="max-w-[1080px] mx-auto px-8 py-7 w-full">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Client management</div>
              <h1 className="text-xl font-semibold mb-1">Clients</h1>
              <p className="text-slate text-[13px] max-w-[520px] leading-relaxed">
                Onboard a new client here \u2014 it creates their login and a
                blank access ledger. Grant modules from their detail page
                afterward.
              </p>
            </div>
            <AddClientForm onCreated={load} />
          </div>

          {!clients ? (
            <div className="text-slate text-sm">Loading\u2026</div>
          ) : (
            <>
              <div className="flex gap-3 flex-wrap mb-5">
                <StatCard label="Total clients" value={clients.length} />
              </div>

              <div className="card p-0 overflow-hidden">
                {clients.length === 0 && (
                  <div className="p-6 text-slate text-sm">No clients yet \u2014 add your first one above.</div>
                )}
                {clients.map((c) => {
                  const access = Object.fromEntries(c.access.map((a) => [a.module, a.granted]));
                  return (
                    <div
                      key={c.id}
                      onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                      className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-line last:border-0 hover:bg-paper cursor-pointer"
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
                        onClick={(e) => downloadPdf(e, c)}
                        disabled={downloadingId === c.id}
                        title="Download PDF report"
                        className="flex items-center gap-1.5 text-xs font-medium border border-line rounded px-2.5 py-1.5 shrink-0 hover:bg-surface disabled:opacity-50"
                      >
                        <Download size={12} />
                        {downloadingId === c.id ? "Preparing\u2026" : "PDF"}
                      </button>
                      <ChevronRight size={16} className="text-slate shrink-0" />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
