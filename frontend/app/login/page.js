"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  // Starts empty. This previously pre-filled the demo admin and
  // "password123", which is a live credential prompt on a real deployment.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState("signin"); // "signin" | "forgot"
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const result = await api.forgotPassword(email);
        setNotice(result.message);
      } else {
        await login(email, password);
      }
    } catch (err) {
      // The server sends `detail` when self-service reset isn't available on
      // this deployment — more useful than the generic error above it.
      setError(err.body?.detail || err.body?.error || err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full border border-line rounded px-3 py-2 text-sm font-mono";

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6">
      <form onSubmit={onSubmit} className="card w-[360px]">
        <div className="w-8 h-8 rounded bg-ink text-paper flex items-center justify-center font-mono text-xs font-semibold mb-4">NX</div>
        <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">
          {mode === "forgot" ? "Reset password" : "Sign in"}
        </div>
        <h1 className="text-xl font-semibold mb-4">SEO Ledger</h1>

        <label className="block text-xs text-slate mb-1">Email</label>
        <input
          className={`${field} mb-3`}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode === "signin" && (
          <>
            <label className="block text-xs text-slate mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className={`${field} mb-4`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {mode === "forgot" && (
          <p className="text-slate text-[11.5px] leading-relaxed mb-4 mt-1">
            We&rsquo;ll send a link to choose a new password. It expires in an hour
            and works once.
          </p>
        )}

        {error && <div className="text-red text-xs mb-3 leading-relaxed">{error}</div>}
        {notice && <div className="text-teal text-xs mb-3 leading-relaxed">{notice}</div>}

        <button
          disabled={busy || !email}
          className="w-full bg-ink text-paper rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy
            ? (mode === "forgot" ? "Sending…" : "Signing in…")
            : (mode === "forgot" ? "Send reset link" : "Sign in")}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "forgot" ? "signin" : "forgot");
            setError(null);
            setNotice(null);
          }}
          className="w-full text-[11.5px] text-slate hover:text-ink mt-3"
        >
          {mode === "forgot" ? "Back to sign in" : "Forgot your password?"}
        </button>
      </form>
    </div>
  );
}
