"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Fingerprint, MailCheck, ShieldCheck, Crown, LogOut, Zap, Globe2 } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { CapsuleCenter } from "@/components/CapsuleCenter";
import { PASSES } from "@/lib/billing";

// Email magic-code identity and host-verified pass linking. Identity tokens
// are browser-held bearer credentials; account data and signed-in history are
// stored by the configured deployment.

const LS_KEY = "sg16/identity";

type Session = {
  token: string;
  email: string;
  plan: string | null;
  planExpiresAt: string | null;
};

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindNote, setBindNote] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadSession();
      if (!stored) return;
      void fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${stored.token}` },
        body: JSON.stringify({ action: "me" }),
        cache: "no-store",
      }).then(async (response) => {
        const data = await response.json();
        if (response.ok && data.ok) {
          const verified: Session = {
            token: stored.token,
            email: data.email,
            plan: data.plan ?? null,
            planExpiresAt: data.planExpiresAt ?? null,
          };
          localStorage.setItem(LS_KEY, JSON.stringify(verified));
          setSession(verified);
        } else if (response.status === 401) {
          localStorage.removeItem(LS_KEY);
        }
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function call(action: string, extra: Record<string, unknown> = {}, bearerToken?: string) {
    const res = await fetch("/api/identity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "request failed");
    return data;
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const d = await call("request", { email });
      setAwaitingCode(email.trim().toLowerCase());
      setDevCode(d.devCode ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const d = await call("verify", { email: awaitingCode ?? email, code });
      const next: Session = {
        token: d.token,
        email: d.email,
        plan: d.plan ?? null,
        planExpiresAt: d.planExpiresAt ?? null,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setSession(next);
      setAwaitingCode(null);
      setCode("");
      setDevCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function bind() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setBindNote(null);
    try {
      let passToken = "";
      const passRaw = localStorage.getItem("sg16/pass");
      if (passRaw) {
        const record = JSON.parse(passRaw) as { token?: unknown };
        if (typeof record.token === "string") passToken = record.token;
      }
      if (!/^[a-f0-9]{64}$/.test(passToken)) {
        throw new Error("No host-issued pass is stored in this browser. Complete checkout first.");
      }
      const data = await call("bind", { pass_token: passToken }, session.token);
      const next: Session = { ...session, plan: data.plan, planExpiresAt: data.planExpiresAt };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setSession(next);
      setBindNote(`${data.plan} was linked to ${data.email}. The host checks its validity when you use it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link the pass.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem(LS_KEY);
    setSession(null);
  }

  const plan = PASSES.find((p) => p.label === session?.plan);
  const expires = session?.planExpiresAt ? new Date(session.planExpiresAt) : null;

  return (
    <SiteChrome>
      <PageHeader
        title="YOUR SOVEREIGN DOMAIN"
        subtitle="Verify an email with a one-time code. The deployment stores your identity and linked pass; signed-in chat history may be stored in its database. Retention depends on deployment settings."
      />

      <div className="mx-auto grid max-w-[1100px] gap-5 px-3 pb-10 sm:px-5 lg:grid-cols-2">
        {/* ── identity card ── */}
        <Panel className="flex flex-col">
          <div className="border-b border-emerald-400/25 px-4 py-3 text-center">
            <h3 className="panel-title text-base" style={{ color: "#22e08c" }}>
              SOVEREIGN IDENTITY
            </h3>
            <p className="mt-1 font-mono2 text-[9px] tracking-[0.22em] text-slate-400">
              EMAIL-ONLY · MAGIC CODE · ZERO PROFILE · 30-DAY DEVICE TOKEN
            </p>
          </div>
          <div className="space-y-3 p-4">
            {!session ? (
              <>
                {!awaitingCode ? (
                  <>
                    <div className="flex items-center gap-2">
                      <MailCheck className="h-4 w-4 flex-none text-emerald-300" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !busy && requestCode()}
                        placeholder="you@yourmail.com"
                        className="input-dark h-10 flex-1 px-3 text-[13px]"
                      />
                    </div>
                    <button
                      onClick={requestCode}
                      disabled={busy || !email.includes("@")}
                      className="btn-red w-full py-2.5 font-display text-[11px] font-black tracking-[0.2em] disabled:opacity-50"
                    >
                      {busy ? "SENDING…" : "SEND MY MAGIC CODE"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-200">
                      Code issued for <b>{awaitingCode}</b>. It lives 10 minutes.
                      {devCode && (
                        <span className="mt-1 block font-mono2 text-[11px] tracking-widest text-amber-200">
                          DEV-ECHO DELIVERY: {devCode}
                          <span className="text-slate-400"> (production sends by email)</span>
                        </span>
                      )}
                    </p>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && !busy && verify()}
                      placeholder="6-digit code"
                      className="input-dark h-11 w-full px-3 text-center font-display text-lg tracking-[0.5em]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={verify}
                        disabled={busy || code.length !== 6}
                        className="btn-red flex-1 py-2.5 font-display text-[11px] font-black tracking-[0.2em] disabled:opacity-50"
                      >
                        {busy ? "VERIFYING…" : "UNLOCK DOMAIN"}
                      </button>
                      <button
                        onClick={() => {
                          setAwaitingCode(null);
                          setDevCode(null);
                        }}
                        className="rounded-md border border-white/15 px-3 py-2 font-display text-[10px] font-bold tracking-widest text-slate-300 hover:text-white"
                      >
                        BACK
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-3">
                  <Fingerprint className="h-6 w-6 text-emerald-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-black tracking-wide text-white">{session.email}</div>
                    <div className="font-mono2 text-[9px] tracking-[0.18em] text-emerald-200">
                      SOVEREIGN TOKEN ACTIVE · 30 DAYS · DEVICE-HELD
                    </div>
                  </div>
                  <button
                    onClick={signOut}
                    title="Sign out of this device"
                    className="inline-flex items-center gap-1 rounded-md border border-red-400/40 px-2 py-1.5 font-display text-[9px] font-bold tracking-widest text-red-300 hover:bg-red-500/15"
                  >
                    <LogOut className="h-3.5 w-3.5" /> OUT
                  </button>
                </div>

                {/* plan state */}
                {expires && session.plan ? (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-3">
                    <div className="flex items-center gap-2 font-display text-[12px] font-black tracking-widest text-amber-200">
                      <Crown className="h-4 w-4" fill="#f5c44c" /> {session.plan.toUpperCase()}
                    </div>
                    <p className="mt-1 font-mono2 text-[10px] tracking-[0.14em] text-slate-300">
                      WORK MODE ACTIVE · EXPIRES {expires.toUTCString().toUpperCase()}
                      {plan && <> · LIST ${plan.price}{plan.unit}</>}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="flex items-center gap-2 font-display text-[11px] font-black tracking-widest text-slate-200">
                      <Zap className="h-4 w-4 text-cyan-300" /> FREE CHANNEL — brain open, fair-use hour applies
                    </div>
                    <p className="mt-1 font-mono2 text-[10px] tracking-[0.14em] text-slate-400">
                      Want work mode everywhere? Grab a pass, then vault it to this email below.
                    </p>
                    <Link href="/subscription" className="mt-2 inline-block font-display text-[10px] font-bold tracking-widest text-cyan-300 underline underline-offset-4 hover:text-cyan-200">
                      SEE THE PASS DECK →
                    </Link>
                  </div>
                )}

                {/* link an existing pass only after server-side verification */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-display text-[10px] font-black tracking-[0.2em] text-slate-200">
                    LINK A HOST-VERIFIED PASS
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    This links the bearer token saved by checkout. The server verifies it; a tier name or locally fabricated record is not accepted.
                  </p>
                  <button
                    onClick={bind}
                    disabled={busy}
                    className="btn-red mt-3 px-4 py-2 font-display text-[10px] font-black tracking-[0.18em] disabled:opacity-50"
                  >
                    {busy ? "VERIFYING…" : "VERIFY & LINK"}
                  </button>
                  {bindNote && <p className="mt-2 text-[11px] font-medium text-emerald-200">{bindNote}</p>}
                </div>
              </>
            )}
            {error && <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">{error}</p>}
            <p className="font-mono2 text-[9px] leading-relaxed tracking-[0.14em] text-slate-500">
              DATA NOTE · the account database stores your verified email and plan binding. Signed-in
              conversations and other account data may also be stored by this deployment; check its retention policy.
            </p>
          </div>
        </Panel>

        {/* ── device capsule ── */}
        <CapsuleCenter email={session?.email ?? null} token={session?.token ?? null} />

        {/* ── doctrine strip ── */}
        <Panel className="lg:col-span-2" soft>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 text-center font-mono2 text-[10px] tracking-[0.2em] text-slate-400">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> VERIFIED EMAIL · ACCOUNT DATA</span>
            <span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-cyan-300" /> BROWSER-HELD BEARER TOKEN</span>
            <span className="inline-flex items-center gap-2"><Fingerprint className="h-4 w-4 text-amber-300" /> DEPLOYMENT RETENTION APPLIES</span>
          </div>
        </Panel>
      </div>
    </SiteChrome>
  );
}
