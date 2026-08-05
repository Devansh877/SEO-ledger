"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@nexit.demo");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.body?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <form onSubmit={onSubmit} className="card w-[360px]">
        <div className="w-8 h-8 rounded bg-ink text-paper flex items-center justify-center font-mono text-xs font-semibold mb-4">NX</div>
        <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Sign in</div>
        <h1 className="text-xl font-semibold mb-4">SEO Ledger</h1>

        <label className="block text-xs text-slate mb-1">Email</label>
        <input
          className="w-full border border-line rounded px-3 py-2 mb-3 text-sm font-mono"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="block text-xs text-slate mb-1">Password</label>
        <input
          type="password"
          className="w-full border border-line rounded px-3 py-2 mb-4 text-sm font-mono"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <div className="text-red text-xs mb-3">{error}</div>}

        <button
          disabled={busy}
          className="w-full bg-ink text-paper rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Signing in\u2026" : "Sign in"}
        </button>

        <div className="text-[11px] text-slate mt-4 leading-relaxed">
          Demo logins (password: <span className="font-mono">password123</span>):<br />
          admin@nexit.demo &middot; cyberforte@client.demo &middot; meridian@client.demo &middot; alderton@client.demo
        </div>
      </form>
    </div>
  );
}
