"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { Rail, TopBar } from "../../../components/TopBar";
import KeywordSettings from "../../../components/KeywordSettings";
import CaptureStatus from "../../../components/CaptureStatus";
import RankingAccuracyNote from "../../../components/RankingAccuracyNote";
import PasswordForm from "../../../components/PasswordForm";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "ADMIN") {
      api.listClients().then((list) => {
        setClients(list);
        if (list.length) setSelectedId(list[0].id);
      });
    } else {
      setSelectedId(user.clientId);
    }
  }, [user]);

  if (loading || !user || !selectedId) return null;

  return (
    <div className="min-h-screen flex">
      <Rail />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="max-w-[720px] mx-auto px-8 py-7 w-full">
          <div className="text-[11px] uppercase tracking-wide text-slate font-semibold mb-1">Settings</div>
          <h1 className="text-xl font-semibold mb-1">Data capture</h1>
          <p className="text-slate text-[13px] mb-5 leading-relaxed">
            {user.role === "ADMIN"
              ? "Choose which client to configure. Every report is captured on a weekly schedule, not fetched live — refresh manually here if a client needs fresher data sooner."
              : "When each of your reports was last captured, and the keywords your account manager is tracking for you."}
          </p>

          {user.role === "ADMIN" && clients && (
            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wide text-slate font-semibold mb-1.5">
                Client
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="border border-line rounded px-3 py-2 text-sm bg-surface"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <CaptureStatus clientId={selectedId} editable={user.role === "ADMIN"} />
          <div className="mb-4">
            <KeywordSettings clientId={selectedId} editable={user.role === "ADMIN"} />
          </div>
          <RankingAccuracyNote />

          {/* Available to admins and clients alike — every account can
              change its own password without needing anyone's help. */}
          <div className="card mt-5">
            <div className="font-semibold text-[13px] mb-1">Your password</div>
            <p className="text-slate text-[12.5px] mb-3 m-0">
              Signed in as <span className="font-mono">{user.email}</span>.
            </p>
            <PasswordForm
              requireCurrent
              onSubmit={({ currentPassword, newPassword }) =>
                api.changePassword(currentPassword, newPassword)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
