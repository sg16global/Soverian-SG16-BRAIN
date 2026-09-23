"use client";

import { useRouter } from "next/navigation";
import { Crown, LogIn } from "lucide-react";
import { useState } from "react";

export default function SignedOutPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "in" }),
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="panel corner w-full max-w-md p-10 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-400/50 bg-gradient-to-b from-red-600/40 to-red-900/40 shadow-[0_0_30px_rgba(255,31,46,.45)]">
          <Crown className="h-8 w-8 text-amber-300" fill="#f5c44c" />
        </span>
        <h1 className="mt-5 font-display text-xl font-black tracking-[0.14em] text-white">
          SESSION ENDED
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          You have signed out of the Sovereign SG16 Brain network. Your conversations and files remain
          stored in your sovereign deployment.
        </p>
        <button onClick={signIn} disabled={busy} className="btn-red mt-6 inline-flex items-center gap-2 px-6 py-3 text-[11px] disabled:opacity-50">
          <LogIn className="h-4 w-4" /> {busy ? "RECONNECTING…" : "ACCESS SG16 BRAIN"}
        </button>
      </div>
    </div>
  );
}
