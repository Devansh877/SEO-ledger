"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../../lib/api";
import { Rail, TopBar } from "../../../../components/TopBar";
import AccessLedger from "../../../../components/AccessLedger";
import IntegrationSettings from "../../../../components/IntegrationSettings";
import ReportView from "../../../../components/ReportView";

// Admin drill-down: grant/revoke modules for one client, and preview
// exactly what that client currently sees (same ReportView component
// their own login renders).
export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);

  useEffect(() => { api.getClient(id).then(setClient); }, [id]);

  if (!client) {
    return (
      <div className="min-h-screen flex">
        <Rail />
        <div className="flex-1 flex flex-col">
          <TopBar />
          <div className="p-8 text-slate text-sm">Loading client\u2026</div>
        </div>
      </div>
    );
  }

  function handleAccessChange(module, granted) {
    setClient((c) => ({
      ...c,
      access: c.access.map((a) => (a.module === module ? { ...a, granted } : a)),
    }));
  }

  return (
    <div className="min-h-screen flex">
      <Rail />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="max-w-[1080px] mx-auto px-8 py-7 w-full">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-slate text-xs font-medium mb-4 hover:text-ink"
          >
            <ArrowLeft size={13} /> Client roster
          </button>

          <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Admin \u00b7 Client detail</div>
          <h1 className="text-xl font-semibold mb-1">{client.name}</h1>
          <p className="text-slate text-[13px] mb-3">{client.industry}</p>

          <IntegrationSettings client={client} onSaved={(updated) => setClient((c) => ({ ...c, ...updated }))} />

          <div className="card mb-5">
            <div className="font-semibold text-[13px] mb-2.5">Access ledger</div>
            <AccessLedger client={client} onChange={handleAccessChange} />
          </div>

          <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-2">Preview \u2014 what this client sees</div>
          <ReportView client={client} />
        </div>
      </div>
    </div>
  );
}
