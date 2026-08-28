"use client";
import { CheckCircle2, Lock, ArrowUpRight, ArrowDownRight, Clock, FlaskConical } from "lucide-react";

export function StatCard({ label, value, deltaPct, positiveIsUp = true }) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const isUp = deltaPct > 0;
  const good = hasDelta && (positiveIsUp ? isUp : !isUp);
  const color = !hasDelta ? "text-slate" : good ? "text-teal" : "text-red";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="card flex-1 min-w-[140px]">
      <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">{label}</div>
      <div className="font-mono text-xl font-semibold mb-1">{value}</div>
      {hasDelta && (
        <span className={`font-mono text-xs font-medium inline-flex items-center gap-0.5 ${color}`}>
          <Icon size={12} strokeWidth={2.5} />
          {Math.abs(deltaPct)}%
        </span>
      )}
    </div>
  );
}

export function Stamp({ granted }) {
  return (
    <span className={`stamp font-mono ${granted ? "stamp-granted" : "stamp-locked"}`}>
      {granted ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <Lock size={11} strokeWidth={2.5} />}
      {granted ? "GRANTED" : "LOCKED"}
    </span>
  );
}

export function LockedPanel({ title, note, icon }) {
  return (
    <div className="card flex flex-col items-start">
      <div className="text-amber mb-2">{icon || <Lock size={16} />}</div>
      <div className="font-semibold text-[13px] mb-1">{title}</div>
      <p className="text-slate text-[12.5px] leading-relaxed m-0">{note}</p>
      <span className="stamp stamp-locked font-mono mt-2.5">
        <Lock size={11} strokeWidth={2.5} /> NOT YET GRANTED
      </span>
    </div>
  );
}

// Distinct from LockedPanel: this module IS granted, it just hasn't been
// captured yet (weekly cron hasn't run since the client was onboarded, or
// nobody's hit "Refresh now" in Settings). Different cause, different copy.
export function PendingPanel({ title, icon }) {
  return (
    <div className="card flex flex-col items-start">
      <div className="text-slate mb-2">{icon || <Clock size={16} />}</div>
      <div className="font-semibold text-[13px] mb-1">{title}</div>
      <p className="text-slate text-[12.5px] leading-relaxed m-0">
        No capture yet — this runs weekly, or an admin can trigger one now from Settings.
      </p>
    </div>
  );
}

// Distinct again: the module IS granted and something WAS captured for it
// at some point, but the request to fetch it just failed — a network
// problem, an expired session, or a backend error. This used to silently
// fall through to looking "locked," which hid real bugs behind a
// misleading permissions message.
export function ErrorPanel({ title, icon, message }) {
  return (
    <div className="card flex flex-col items-start border-red/40">
      <div className="text-red mb-2">{icon || <Lock size={16} />}</div>
      <div className="font-semibold text-[13px] mb-1">{title}</div>
      <p className="text-red text-[12.5px] leading-relaxed m-0 font-mono">
        Couldn't load this: {message}
      </p>
    </div>
  );
}

// Shown whenever a captured payload was generated rather than fetched.
// Every capture service falls back to mock data when a credential is
// missing or an API call fails, and the numbers are formatted identically
// either way — without this, a client could be shown invented figures and
// have no way to tell. Deliberately loud.
export function MockBanner({ module }) {
  return (
    <div className="border border-amber/40 bg-amber/10 rounded p-2.5 mb-3 flex items-start gap-2">
      <FlaskConical size={14} className="text-amber mt-0.5 shrink-0" />
      <div className="text-[12px] leading-relaxed">
        <span className="font-semibold text-amber">Placeholder data</span>
        <span className="text-slate">
          {" "}— {module ? `${module} is` : "this module is"} not connected to a live
          source, so these numbers are generated, not measured. Don't report them to a client.
        </span>
      </div>
    </div>
  );
}
