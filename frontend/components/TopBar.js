"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users2, FileBarChart, Settings } from "lucide-react";
import { useAuth } from "../lib/auth-context";

export function Rail() {
  const pathname = usePathname();
  const onSettings = pathname?.startsWith("/dashboard/settings");
  const onClients = pathname?.startsWith("/dashboard/clients");
  const onOverview = pathname === "/dashboard";

  return (
    <nav className="w-16 border-r border-line flex flex-col items-center py-4 gap-5 shrink-0 hidden md:flex">
      <div className="w-7 h-7 rounded bg-ink text-paper flex items-center justify-center font-mono text-[11px] font-semibold">NX</div>
      <Link
        href="/dashboard"
        title="Overview"
        className={`w-8 h-8 rounded flex items-center justify-center ${onOverview ? "bg-ink text-paper" : "text-slate hover:bg-paper"}`}
      >
        <LayoutDashboard size={16} />
      </Link>
      <Link
        href="/dashboard/clients"
        title="Clients \u2014 add and manage clients"
        className={`w-8 h-8 rounded flex items-center justify-center ${onClients ? "bg-ink text-paper" : "text-slate hover:bg-paper"}`}
      >
        <Users2 size={16} />
      </Link>
      <div className="w-8 h-8 rounded text-slate flex items-center justify-center" title="Reports (see a client's dashboard)"><FileBarChart size={16} /></div>
      <Link
        href="/dashboard/settings"
        title="Settings"
        className={`w-8 h-8 rounded flex items-center justify-center mt-auto ${onSettings ? "bg-ink text-paper" : "text-slate hover:bg-paper"}`}
      >
        <Settings size={16} />
      </Link>
    </nav>
  );
}

export function TopBar({ title, subtitle }) {
  const { user, logout } = useAuth();
  return (
    <div className="h-14 border-b border-line flex items-center justify-between px-6 shrink-0">
      <div>
        <div className="font-semibold tracking-tight">{title || "SEO Ledger"}</div>
        <div className="text-xs text-slate">{subtitle || "NexIT Solutions \u00b7 reporting platform"}</div>
      </div>
      {user && (
        <div className="flex items-center gap-3 text-xs text-slate">
          <span className="font-mono">{user.email}</span>
          <button onClick={logout} className="border border-line rounded px-2 py-1 hover:bg-paper">Sign out</button>
        </div>
      )}
    </div>
  );
}
