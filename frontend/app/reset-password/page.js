"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KeyRound, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import PasswordForm from "../../components/PasswordForm";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="card max-w-[420px] w-full">
        <div className="text-red mb-2"><AlertTriangle size={18} /></div>
        <h1 className="text-lg font-semibold mb-1">This link is incomplete</h1>
        <p className="text-slate text-[12.5px] mb-4">
          It&rsquo;s missing its reset token. Open the link from your email directly rather
          than retyping it &mdash; the token is long and easy to truncate.
        </p>
        <a href="/login" className="text-teal text-[12.5px]">Back to sign in</a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card max-w-[420px] w-full">
        <h1 className="text-lg font-semibold mb-1">Password updated</h1>
        <p className="text-slate text-[12.5px] mb-4">You can sign in with your new password now.</p>
        <button onClick={() => router.push("/login")}
          className="bg-ink text-paper rounded px-3 py-1.5 text-xs font-medium">
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="card max-w-[420px] w-full">
      <div className="text-slate mb-2"><KeyRound size={18} /></div>
      <h1 className="text-lg font-semibold mb-1">Choose a new password</h1>
      <p className="text-slate text-[12.5px] mb-4">
        Reset links expire an hour after they&rsquo;re sent and work once.
      </p>
      <PasswordForm
        requireCurrent={false}
        submitLabel="Set new password"
        onSubmit={async ({ newPassword }) => {
          await api.resetPassword(token, newPassword);
          setDone(true);
        }}
      />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-paper">
      {/* useSearchParams needs a Suspense boundary or the build fails
          prerendering this route. */}
      <Suspense fallback={<div className="text-slate text-sm">Loading…</div>}>
        <ResetInner />
      </Suspense>
    </div>
  );
}
