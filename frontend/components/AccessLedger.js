"use client";
import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { api } from "../lib/api";

const MODULES = [
  { code: "GA4-01", label: "Analytics" },
  { code: "KWD-02", label: "Keyword rankings" },
  { code: "GMB-03", label: "Business profile" },
  { code: "CNV-04", label: "Conversions" },
];

// The admin-editable version of the ledger: clicking a stamp flips it and
// persists via PUT /access/:clientId/:module. This is the single control
// surface behind everything ReportView conditionally renders.
export default function AccessLedger({ client, onChange }) {
  const [access, setAccess] = useState(
    Object.fromEntries((client.access || []).map((a) => [a.module, a.granted]))
  );
  const [busy, setBusy] = useState(null);

  async function toggle(code) {
    setBusy(code);
    const next = !access[code];
    try {
      await api.setAccess(client.id, code, next);
      setAccess((a) => ({ ...a, [code]: next }));
      onChange && onChange(code, next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {MODULES.map((m) => {
        const granted = access[m.code];
        return (
          <button
            key={m.code}
            onClick={() => toggle(m.code)}
            disabled={busy === m.code}
            title={m.label}
            className={`stamp font-mono cursor-pointer transition-opacity ${
              granted ? "stamp-granted" : "stamp-locked"
            } ${busy === m.code ? "opacity-50" : ""}`}
          >
            {granted ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <Lock size={11} strokeWidth={2.5} />}
            {m.code}
          </button>
        );
      })}
    </div>
  );
}
