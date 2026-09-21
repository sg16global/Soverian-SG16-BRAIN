"use client";

import { useEffect, useState } from "react";
import { Check, Crown, ShieldCheck, Globe2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import {
  BILLING_COPY,
  HUMANITARIAN_REGION,
  PASSES,
  formatExpiry,
  getRegionOverride,
  loadPassRecord,
  localIssue,
  passLabel,
  resolveRegion,
  storePassRecord,
  type PassId,
  type PassRecord,
} from "@/lib/billing";

export default function SubscriptionPage() {
  const [record, setRecord] = useState<PassRecord | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [regionOverride, setRegionOverrideState] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const override = getRegionOverride();
      setRegionOverrideState(override);
      setRegion(resolveRegion(override));
      setRecord(loadPassRecord());
    });
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => setGateway(d.billing?.gateway?.mode ?? null))
      .catch(() => {});
  }, []);

  const humanitarian = region === HUMANITARIAN_REGION;

  async function choose(id: PassId, label: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pass: id,
          region,
          provider: "guest",
          return_url: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "core checkout unavailable");

      if (data.mode === "dodo" && data.checkout_url) {
        // Live Dodo Payments Merchant-of-Record session: redirect.
        window.location.assign(data.checkout_url);
        return;
      }
      // Sovereign local issuance or humanitarian bypass: record handed over.
      activate({ ...(data.record as PassRecord), gateway: data.gateway ?? data.mode });
    } catch {
      // Exact old fallback: the host is unreachable, so this device issues
      // the same duration-locked record locally and keeps the deck open.
      activate(localIssue(id, humanitarian ? HUMANITARIAN_REGION : region));
    } finally {
      setBusy(null);
    }
  }

  function activate(rec: PassRecord) {
    storePassRecord(rec);
    setRecord(rec);
    setConfirmed(passLabel(rec.pass));
    setTimeout(() => setConfirmed(null), 3200);
    // Soften the account page into agreement (best effort, like old sync).
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: passLabel(rec.pass) }),
    }).catch(() => {});
  }

  return (
    <SiteChrome>
      <PageHeader
        title="SUBSCRIPTION"
        subtitle={`${BILLING_COPY.deckTitle} \u2014 ${BILLING_COPY.localizedNote}`}
      />

      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-8">
        {/* current entitlement — ported from the old settings subscription view */}
        <Panel className="p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <h2 className="font-display text-[12px] font-black tracking-widest text-white">
                CURRENT ENTITLEMENT
              </h2>
            </div>
            {record ? (
              <p className="font-mono2 text-[11px] tracking-wider text-emerald-300">
                ACTIVE PASS · {passLabel(record.pass)} · ${record.price_charged} CHARGED ·
                EXPIRES {formatExpiry(record.expires_at)} · VERIFIED{" "}
                {record.verified_locally ? "LOCALLY" : "BY HOST"}
              </p>
            ) : (
              <p className="font-mono2 text-[11px] tracking-wider text-slate-400">
                {BILLING_COPY.noPassNote}
              </p>
            )}
            <span className="ml-auto inline-flex items-center gap-2 font-mono2 text-[10px] tracking-[0.2em] text-slate-400">
              <Globe2 className="h-3.5 w-3.5 text-cyan-300" />
              REGION: {(humanitarian ? HUMANITARIAN_REGION : region) ?? "auto"}
              {regionOverride !== "auto" && " (override)"}
              {humanitarian && <span className="text-emerald-300">· FREE (HUMANITARIAN)</span>}
              {gateway && <span className="text-slate-500">· GATEWAY {gateway.toUpperCase()}</span>}
            </span>
          </div>
        </Panel>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 flex-none" /> {error}
          </div>
        )}

        {/* the pass deck — exact old tiers, logic and copy */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PASSES.map((p) => {
            const isCurrent = record?.pass === p.id;
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
                  <h2 className="font-display text-[14px] font-black tracking-wide text-white">
                    {p.label}
                  </h2>
                </div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-display text-4xl font-black" style={{ color: p.accent }}>
                    ${humanitarian ? 0 : p.price}
                  </span>
                  <span className="pb-1 font-mono2 text-[10px] tracking-widest text-slate-400">
                    {p.unit}
                    {humanitarian && " · ZERO-RATE"}
                  </span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  <li className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: p.accent }} strokeWidth={3} />
                    {p.blurb}
                  </li>
                  <li className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: p.accent }} strokeWidth={3} />
                    Duration-locked {p.hours}h sovereign token
                  </li>
                  <li className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: p.accent }} strokeWidth={3} />
                    Panel throttle lifted · signed record on-device
                  </li>
                </ul>
                {isCurrent ? (
                  <span className="mt-6 rounded-lg border border-emerald-400/50 bg-emerald-500/10 py-2.5 text-center font-display text-[11px] font-black tracking-widest text-emerald-300">
                    ACTIVE PASS
                  </span>
                ) : (
                  <button
                    onClick={() => choose(p.id, p.label)}
                    disabled={busy === p.id}
                    className="btn-red mt-6 py-2.5 text-[11px] disabled:opacity-50"
                  >
                    {busy === p.id ? "ACTIVATING…" : "SUBSCRIBE"}
                  </button>
                )}
              </Panel>
            );
          })}
        </div>

        {/* the two sovereign notes — exact old copy */}
        <Panel className="space-y-3 p-5">
          <p className="text-[12px] leading-relaxed text-slate-300">
            <span className="font-display text-[10px] font-black tracking-widest text-emerald-300">
              HUMANITARIAN ZERO-RATE ·{" "}
            </span>
            {BILLING_COPY.humanitarianNote}
          </p>
          <p className="text-[12px] leading-relaxed text-slate-400">
            <span className="font-display text-[10px] font-black tracking-widest text-cyan-300">
              GATEWAY MODEL ·{" "}
            </span>
            {BILLING_COPY.gatewayNote}
          </p>
        </Panel>
      </div>

      {confirmed && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-emerald-400/60 bg-[#08130d]/95 px-5 py-3 font-display text-[11px] font-bold tracking-widest text-emerald-300 shadow-[0_0_30px_rgba(34,224,140,.4)]">
          PASS ACTIVATED · {confirmed}
        </div>
      )}
      <p className="pb-10 text-center font-mono2 text-[10px] tracking-widest text-slate-500">
        NEED SOMETHING DIFFERENT?{" "}
        <Link href="/contact" className="text-cyan-300 underline">
          CONTACT THE GLOBAL DESK
        </Link>
      </p>
    </SiteChrome>
  );
}
