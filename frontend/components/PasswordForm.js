"use client";
import { useState } from "react";
import { Check, Loader2, KeyRound } from "lucide-react";

export const MIN_PASSWORD_LENGTH = 12;

// Shared by the change-password panel, the forced first-login gate and the
// reset page, so the rules a user sees are identical in all three. The
// server validates independently — this only saves a round trip.
export default function PasswordForm({
  onSubmit,
  requireCurrent = true,
  submitLabel = "Change password",
  busyLabel = "Saving…",
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= MIN_PASSWORD_LENGTH && next === confirm && (!requireCurrent || current);

  async function handle(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-teal text-[12.5px] flex items-center gap-1.5 m-0">
        <Check size={13} /> Password updated.
      </p>
    );
  }

  const field = "w-full border border-line rounded px-3 py-2 text-[12.5px]";

  return (
    <form onSubmit={handle} className="space-y-2.5 max-w-[360px]">
      {requireCurrent && (
        <div>
          <label className="block text-[11px] text-slate mb-1">Current password</label>
          <input type="password" value={current} autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)} className={field} />
        </div>
      )}

      <div>
        <label className="block text-[11px] text-slate mb-1">New password</label>
        <input type="password" value={next} autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)} className={field} />
        <p className={`text-[11px] mt-1 m-0 ${tooShort ? "text-amber" : "text-slate"}`}>
          At least {MIN_PASSWORD_LENGTH} characters. A short phrase you&rsquo;ll remember beats
          a short jumble you won&rsquo;t.
        </p>
      </div>

      <div>
        <label className="block text-[11px] text-slate mb-1">Confirm new password</label>
        <input type="password" value={confirm} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)} className={field} />
        {mismatch && <p className="text-[11px] text-red mt-1 m-0">These don&rsquo;t match.</p>}
      </div>

      {error && <p className="text-red text-[12px] m-0">{error}</p>}

      <button disabled={!ready || busy}
        className="flex items-center gap-1.5 bg-ink text-paper rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
