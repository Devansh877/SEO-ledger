"use client";
import { KeyRound } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import PasswordForm from "./PasswordForm";

// Blocks the dashboard until a generated password has been replaced.
//
// Wrapping the dashboard rather than redirecting from login means there is
// exactly one place this is enforced — a second entry point added later
// can't forget to check.
export default function PasswordGate({ children }) {
  const { user, clearPasswordChangeRequirement } = useAuth();

  if (!user?.mustChangePassword) return children;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-paper">
      <div className="card max-w-[420px] w-full">
        <div className="text-amber mb-2"><KeyRound size={18} /></div>
        <h1 className="text-lg font-semibold mb-1">Choose your own password</h1>
        <p className="text-slate text-[12.5px] leading-relaxed mb-4">
          You&rsquo;re signed in with a password that was generated for you and
          shared over email or read aloud. Pick your own before continuing &mdash;
          it takes a moment and it&rsquo;s the only copy that stays private to you.
        </p>
        <PasswordForm
          requireCurrent
          submitLabel="Set password and continue"
          onSubmit={async ({ currentPassword, newPassword }) => {
            await api.changePassword(currentPassword, newPassword);
            clearPasswordChangeRequirement();
          }}
        />
      </div>
    </div>
  );
}
