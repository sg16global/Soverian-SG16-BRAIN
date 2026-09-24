"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Activity,
  Database,
  Cpu,
  Heart,
  Globe,
  KeyRound,
  FileStack,
  Users,
  Crown,
  Settings,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  BookOpen,
  Lock,
} from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel, StatusPill } from "@/components/ui/Panel";
import { identityHeaders } from "@/lib/browser-identity";

type Health = {
  ok: boolean;
  database: boolean;
  brain: "online" | "offline";
  persistence: string;
  heart: { status: string; model?: string; detail?: string };
  answering: string;
  engines: string[];
  charter?: { laws?: number; bodies?: number; digest?: string };
  children?: { allowedOrigins?: number; mode?: string };
};

type Model = {
  id: string;
  name: string;
  vendor: string;
  role: string;
  status: string;
  selfHosted: boolean;
};

type Billing = {
  currency: string;
  passes: Record<string, { label: string; price: string; hours: number }>;
  gateway?: { provider: string; mode: string };
};

type AdminStats = {
  sessions: number;
  files: number;
  tokens: number;
  devices: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <Panel soft corners={false} className="p-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl border"
          style={{
            borderColor: `${accent}50`,
            background: `${accent}18`,
            color: accent,
            boxShadow: `0 0 18px ${accent}30`,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-mono2 text-[9px] tracking-[0.18em] text-slate-400">{label}</p>
          <p className="font-display text-xl font-black tracking-wide text-white">{value}</p>
          {sub && <p className="font-mono2 text-[9px] tracking-widest text-slate-500">{sub}</p>}
        </div>
      </div>
    </Panel>
  );
}

export default function AdminPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [stats, setStats] = useState<AdminStats>({ sessions: 0, files: 0, tokens: 0, devices: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = identityHeaders();

        // health is public, but we try with auth anyway
        const hRes = await fetch("/api/health", { cache: "no-store", headers });
        const hData = await hRes.json();
        if (hRes.ok) setHealth(hData);

        const mRes = await fetch("/api/models", { cache: "no-store" });
        const mData = await mRes.json();
        if (mRes.ok) setModels(mData.models ?? []);

        const bRes = await fetch("/api/billing", { cache: "no-store" });
        const bData = await bRes.json();
        if (bRes.ok) setBilling(bData.billing ?? bData);

        // account-scoped stats — will 401 if not signed in, we handle gracefully
        const results = await Promise.all([
          fetch("/api/chat?sessions=1", { headers, cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ sessions: [] })),
          fetch("/api/files", { headers, cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ files: [] })),
          fetch("/api/tokens", { headers, cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ tokens: [] })),
          fetch("/api/devices", { headers, cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ devices: [] })),
          fetch("/api/profile", { headers, cache: "no-store" })
            .then(async (r) => {
              const j = await r.json();
              return { ok: r.ok, data: j };
            })
            .catch(() => ({ ok: false, data: null })),
        ]);

        const [s, f, t, d, p] = results;
        setIsAuthed(!!(p as any)?.ok);
        setStats({
          sessions: (s as any).sessions?.length ?? 0,
          files: (f as any).files?.length ?? 0,
          tokens: (t as any).tokens?.filter((x: { revoked: boolean }) => !x.revoked).length ?? 0,
          devices: (d as any).devices?.length ?? 0,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load admin console.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <SiteChrome>
      <PageHeader
        title="ADMIN CONSOLE"
        subtitle="Sovereign operator dashboard — system health, charter law, models, billing, and live presence. Restricted to verified account holders."
      />

      <div className="mx-auto max-w-[1200px] space-y-6 px-3 py-8 sm:px-5">
        {/* top banner */}
        <Panel className="relative overflow-hidden p-0">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-transparent to-cyan-500/15" />
          <div className="relative grid items-center gap-6 p-6 sm:grid-cols-[auto_1fr_auto] sm:p-8">
            <span className="grid h-16 w-16 place-items-center rounded-2xl border border-red-400/50 bg-gradient-to-b from-red-600/40 to-red-900/40 shadow-[0_0_28px_rgba(255,31,46,.4)]">
              <Shield className="h-8 w-8 text-white" />
            </span>
            <div>
              <h2 className="font-display text-xl font-black tracking-widest text-white sm:text-2xl">
                SOVEREIGN <span className="text-red-400">SG16</span> BRAIN — OPERATOR MODE
              </h2>
              <p className="mt-1 max-w-2xl font-mono2 text-[11px] leading-relaxed tracking-wider text-slate-300">
                This console is the single operator surface for the SG16 platform. Health, charter, models,
                billing, and presence are reported honestly — no mock statuses, no hidden dossiers. All data
                lives on this deployment; no third-party analytics.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-mono2 text-[9px] tracking-widest text-emerald-300">
                  ADMIN · {isAuthed ? "VERIFIED" : "GUEST VIEW"}
                </span>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 font-mono2 text-[9px] tracking-widest text-cyan-300">
                  BUILD · {health?.persistence ?? "checking"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono2 text-[9px] tracking-widest text-slate-300">
                  ANSWERING · {(health?.answering ?? "unknown").toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Link href="/account" className="btn-ghost px-4 py-2 text-[11px]">
                <Users className="mr-2 inline h-4 w-4" />
                ACCOUNT
              </Link>
              <Link href="/settings" className="btn-ghost px-4 py-2 text-[11px]">
                <Settings className="mr-2 inline h-4 w-4" />
                SETTINGS
              </Link>
            </div>
          </div>
        </Panel>

        {loading && (
          <Panel className="p-10 text-center font-display text-sm tracking-widest text-slate-500 pulse-soft">
            LOADING ADMIN CONSOLE…
          </Panel>
        )}

        {error && (
          <Panel className="border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {error}
          </Panel>
        )}

        {/* health grid */}
        {health && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Database}
                label="DATABASE"
                value={health.database ? "ONLINE" : "OFFLINE"}
                sub={health.ok ? "ledger answering" : "ledger unreachable"}
                accent={health.database ? "#22e08c" : "#ff3b4c"}
              />
              <StatCard
                icon={Cpu}
                label="SOVEREIGN CORE"
                value={health.brain.toUpperCase()}
                sub={`Q16.16 · ${health.engines.join(" → ")}`}
                accent={health.brain === "online" ? "#39d7ff" : "#ffb020"}
              />
              <StatCard
                icon={Heart}
                label="HEART-BRIDGE"
                value={health.heart.status.toUpperCase()}
                sub={health.heart.model ?? health.heart.detail ?? "ollama bridge"}
                accent={health.heart.status === "online" ? "#ff8a3d" : "#8aa0bd"}
              />
              <StatCard
                icon={Globe}
                label="GLOBAL PRESENCE"
                value={`${health.children?.allowedOrigins ?? 0} ORIGINS`}
                sub={health.children?.mode ?? "children lock"}
                accent="#ffd166"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Panel className="p-5">
                <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
                  <Activity className="h-4 w-4 text-cyan-300" /> SYSTEM HEALTH
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="font-mono2 text-[10px] tracking-widest text-slate-400">DATABASE LEDGER</p>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusPill status={health.database ? "online" : "offline"} />
                      <span className="font-mono2 text-[11px] text-slate-300">
                        {health.database ? "Postgres / local DB answering" : "DB unreachable — check DATABASE_URL"}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="font-mono2 text-[10px] tracking-widest text-slate-400">BRAIN GATEWAY</p>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusPill status={health.brain} />
                      <span className="font-mono2 text-[11px] text-slate-300">
                        answering: {health.answering} · {health.engines.join(" / ")}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="font-mono2 text-[10px] tracking-widest text-slate-400">CHARTER LAW</p>
                    <p className="mt-1 font-display text-[11px] font-bold tracking-widest text-cyan-200">
                      {health.charter?.laws ?? 16} LAWS · {health.charter?.bodies ?? 3} BODIES ·{" "}
                      <span className="font-mono2 text-[10px] text-slate-400">{health.charter?.digest?.slice(0, 12) ?? "—"}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="font-mono2 text-[10px] tracking-widest text-slate-400">CHILDREN LOCK</p>
                    <p className="mt-1 font-mono2 text-[11px] text-slate-300">
                      CORS allow-list: {health.children?.allowedOrigins ?? 0} origins · mode: {health.children?.mode ?? "enforced"}
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel className="p-5">
                <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
                  <BarChart3 className="h-4 w-4 text-amber-300" /> ACCOUNT LEDGER
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 text-center">
                    <p className="font-display text-2xl font-black text-white">{stats.sessions}</p>
                    <p className="font-mono2 text-[9px] tracking-widest text-cyan-300">CONVERSATIONS</p>
                  </div>
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-center">
                    <p className="font-display text-2xl font-black text-white">{stats.files}</p>
                    <p className="font-mono2 text-[9px] tracking-widest text-emerald-300">FILES</p>
                  </div>
                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-center">
                    <p className="font-display text-2xl font-black text-white">{stats.tokens}</p>
                    <p className="font-mono2 text-[9px] tracking-widest text-amber-300">API TOKENS</p>
                  </div>
                  <div className="rounded-lg border border-red-400/20 bg-red-500/5 p-3 text-center">
                    <p className="font-display text-2xl font-black text-white">{stats.devices}</p>
                    <p className="font-mono2 text-[9px] tracking-widest text-red-300">DEVICES</p>
                  </div>
                </div>
                {!isAuthed && (
                  <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 font-mono2 text-[10px] leading-relaxed text-amber-200">
                    Sign in to see your own ledger. Guest view shows 0 for privacy — no other pilot&apos;s data is ever revealed.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/history" className="btn-ghost px-3 py-1.5 text-[10px]">
                    HISTORY
                  </Link>
                  <Link href="/files" className="btn-ghost px-3 py-1.5 text-[10px]">
                    FILES
                  </Link>
                  <Link href="/api-access" className="btn-ghost px-3 py-1.5 text-[10px]">
                    TOKENS
                  </Link>
                  <Link href="/devices" className="btn-ghost px-3 py-1.5 text-[10px]">
                    DEVICES
                  </Link>
                </div>
              </Panel>
            </div>
          </>
        )}

        {/* models */}
        <Panel className="p-5">
          <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
            <Layers className="h-4 w-4 text-red-400" /> CONNECTED MODELS · {models.length}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-[12px] font-black tracking-widest text-white">{m.name.toUpperCase()}</p>
                  <StatusPill status={m.status} />
                </div>
                <p className="mt-1 font-mono2 text-[10px] tracking-widest text-slate-400">
                  {m.vendor} · {m.role} · {m.selfHosted ? "SELF-HOSTED" : "RELAY"}
                </p>
                <p className="mt-2 font-mono2 text-[10px] text-slate-500">id: {m.id}</p>
              </div>
            ))}
            {models.length === 0 && !loading && (
              <p className="col-span-full font-mono2 text-[11px] tracking-widest text-slate-500">No models reported — seed may be pending.</p>
            )}
          </div>
        </Panel>

        {/* billing */}
        {billing && (
          <Panel className="p-5">
            <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
              <Crown className="h-4 w-4 text-amber-300" /> BILLING · {billing.currency} · {billing.gateway?.provider ?? "dodo"} ·{" "}
              <span className="font-mono2 text-[10px] tracking-widest text-slate-400">{billing.gateway?.mode ?? "display-only"}</span>
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(billing.passes).map(([id, pass]) => (
                <div key={id} className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-4">
                  <p className="font-display text-[11px] font-black tracking-[0.14em] text-amber-200">{pass.label.toUpperCase()}</p>
                  <p className="mt-1 font-display text-2xl font-black text-white">{pass.price}</p>
                  <p className="font-mono2 text-[10px] tracking-widest text-slate-400">{pass.hours}h · id: {id}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono2 text-[10px] leading-relaxed tracking-wider text-slate-500">
              Checkout is fail-closed when Dodo credentials are unset. Pass verification and webhook correlation enforce amount, currency (USD), and region match. No client-side minting.
            </p>
          </Panel>
        )}

        {/* doctrine + quick links */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel className="p-5">
            <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
              <BookOpen className="h-4 w-4 text-cyan-300" /> SOVEREIGN DOCTRINE
            </h3>
            <div className="mt-4 space-y-3 font-mono2 text-[11px] leading-relaxed tracking-wider text-slate-300">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>One brain, one charter, one operator — every body speaks under the same 16 laws.</span>
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>Identity is absent by design for children; flagship archive is never exposed to children origins (CORS lock enforced).</span>
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>Engine ladder: core → ollama heart-bridge → fallback-local. No vendor API is called unless operator configures it.</span>
              </p>
              <p className="flex gap-2">
                <Lock className="mt-0.5 h-4 w-4 flex-none text-amber-300" />
                <span>Apache-2.0 posture, zero hidden dossiers, process-local fair-use buckets, and honest model statuses.</span>
              </p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Link href="/vision" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center transition hover:border-cyan-400/40">
                <p className="font-display text-[11px] font-black tracking-widest text-white">OUR VISION</p>
                <p className="mt-1 font-mono2 text-[9px] tracking-widest text-slate-400">Sovereign charter</p>
              </Link>
              <Link href="/services" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center transition hover:border-cyan-400/40">
                <p className="font-display text-[11px] font-black tracking-widest text-white">SERVICES</p>
                <p className="mt-1 font-mono2 text-[9px] tracking-widest text-slate-400">Deployment help</p>
              </Link>
              <Link href="/contact" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center transition hover:border-cyan-400/40">
                <p className="font-display text-[11px] font-black tracking-widest text-white">CONTACT</p>
                <p className="mt-1 font-mono2 text-[9px] tracking-widest text-slate-400">Operator line</p>
              </Link>
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">
              <Server className="h-4 w-4 text-red-400" /> OPERATOR ACTIONS
            </h3>
            <div className="mt-4 space-y-2.5">
              <a
                href="/api/health"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono2 text-[11px] tracking-widest text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
              >
                <span>GET /api/health</span>
                <span className="text-[10px] text-slate-500">JSON ↗</span>
              </a>
              <a
                href="/api/models"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono2 text-[11px] tracking-widest text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
              >
                <span>GET /api/models</span>
                <span className="text-[10px] text-slate-500">JSON ↗</span>
              </a>
              <a
                href="/api/billing"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono2 text-[11px] tracking-widest text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
              >
                <span>GET /api/billing</span>
                <span className="text-[10px] text-slate-500">JSON ↗</span>
              </a>
              <Link
                href="/api-access"
                className="flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 font-mono2 text-[11px] tracking-widest text-amber-200 transition hover:border-amber-400/50"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> API TOKENS
                </span>
                <span className="text-[10px]">MANAGE →</span>
              </Link>
              <Link
                href="/subscription"
                className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 font-mono2 text-[11px] tracking-widest text-emerald-200 transition hover:border-emerald-400/50"
              >
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4" /> SUBSCRIPTION
                </span>
                <span className="text-[10px]">PASSES →</span>
              </Link>
            </div>
            <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="font-display text-[10px] font-black tracking-[0.18em] text-red-300">SECURITY NOTE</p>
              <p className="mt-1 font-mono2 text-[10px] leading-relaxed tracking-wider text-red-200/80">
                Admin console never shows secrets. Owner bypass requires server-side SG16_OWNER_SECRET header, never a client token. Email-as-owner is disabled. All rate limits are process-local.
              </p>
            </div>
          </Panel>
        </div>

        {/* imagery showcase — proves the 5d9ac32 imagery payload */}
        <Panel className="overflow-hidden p-0">
          <div className="grid md:grid-cols-3">
            <div className="relative min-h-[180px] border-b border-white/10 md:border-b-0 md:border-r">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/globe.png" alt="Sovereign global vision globe" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <p className="absolute bottom-2 left-3 font-display text-[10px] font-black tracking-[0.18em] text-cyan-200">GLOBE · GLOBAL VISION</p>
            </div>
            <div className="relative min-h-[180px] border-b border-white/10 md:border-b-0 md:border-r">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/ai-brain.jpg" alt="AI brain on circuit board" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <p className="absolute bottom-2 left-3 font-display text-[10px] font-black tracking-[0.18em] text-emerald-200">BRAIN · WHAT IS AI</p>
            </div>
            <div className="relative min-h-[180px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/shield.png" alt="Shield protecting united people" className="absolute inset-0 h-full w-full object-contain bg-[#070a10] p-6" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <p className="absolute bottom-2 left-3 font-display text-[10px] font-black tracking-[0.18em] text-amber-200">SHIELD · RESPONSIBLE AI</p>
            </div>
          </div>
        </Panel>

        <div className="flex justify-center gap-3 pb-6">
          <Link href="/" className="btn-ghost px-5 py-2 text-[11px]">
            ← BACK TO HOME
          </Link>
          <Link href="/chat" className="btn-red px-5 py-2 text-[11px]">
            OPEN CHAT
          </Link>
        </div>
      </div>
    </SiteChrome>
  );
}
