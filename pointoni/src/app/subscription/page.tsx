"use client";

import { useEffect, useState } from "react";
import { Check, Crown } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { PLANS } from "@/lib/content";
import Link from "next/link";

export default function SubscriptionPage() {
  const [plan, setPlan] = useState<string>("Sovereign Free Pilot");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setPlan(d.user?.preferences?.plan ?? "Sovereign Free Pilot"))
      .catch(() => {});
  }, []);

  async function choose(id: string, name: string) {
    if (id === "enterprise") {
      window.location.href = "/contact?subject=Enterprise%20Deployment";
      return;
    }
    setBusy(id);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: name }),
    });
    if (res.ok) {
      setPlan(name);
      setConfirmed(name);
      setTimeout(() => setConfirmed(null), 3000);
    }
    setBusy(null);
  }

  return (
    <SiteChrome>
      <PageHeader title="SUBSCRIPTION" subtitle="Upgrade sovereign capacity while retaining full ownership. Every tier runs the self-hosted SG16 Brain core." />
      <div className="mx-auto grid max-w-[1100px] gap-5 px-4 py-10 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = plan === p.name;
          return (
            <Panel
              key={p.id}
              className={`relative flex flex-col p-6 ${p.featured ? "border-emerald-400/60 shadow-[0_0_34px_rgba(34,224,140,.18)]" : ""}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-0.5 font-display text-[9px] font-black tracking-[0.2em] text-black">
                  MOST SOVEREIGN
                </span>
              )}
              <div className="flex items-center gap-2.5">
                <Crown className="h-6 w-6" style={{ color: p.accent }} />
                <h2 className="font-display text-[15px] font-black tracking-wide text-white">{p.name}</h2>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <span className="font-display text-4xl font-black" style={{ color: p.accent }}>{p.price}</span>
                <span className="pb-1 font-mono2 text-[10px] tracking-widest text-slate-400">{p.period}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: p.accent }} strokeWidth={3} />
                    {f}
                  </li>
                ))}
              </ul>
              {current ? (
                <span className="mt-6 rounded-lg border border-emerald-400/50 bg-emerald-500/10 py-2.5 text-center font-display text-[11px] font-black tracking-widest text-emerald-300">
                  CURRENT PLAN
                </span>
              ) : (
                <button
                  onClick={() => choose(p.id, p.name)}
                  disabled={busy === p.id}
                  className="btn-red mt-6 py-2.5 text-[11px] disabled:opacity-50"
                >
                  {busy === p.id ? "UPDATING…" : p.cta}
                </button>
              )}
            </Panel>
          );
        })}
      </div>
      {confirmed && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-emerald-400/60 bg-[#08130d]/95 px-5 py-3 font-display text-[11px] font-bold tracking-widest text-emerald-300 shadow-[0_0_30px_rgba(34,224,140,.4)]">
          PLAN UPDATED · {confirmed}
        </div>
      )}
      <p className="pb-10 text-center font-mono2 text-[10px] tracking-widest text-slate-500">
        NEED SOMETHING DIFFERENT? <Link href="/contact" className="text-cyan-300 underline">CONTACT THE GLOBAL DESK</Link>
      </p>
    </SiteChrome>
  );
}
