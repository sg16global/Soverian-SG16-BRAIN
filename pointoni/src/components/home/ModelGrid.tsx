"use client";

import { useEffect, useState } from "react";
import { Cpu, MapPin, RotateCw, Anchor } from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui/Panel";
import { ModelGlyph } from "@/components/ModelGlyph";
import {
  AI_REGISTRY,
  BATCH_INTERVAL_MS,
  REGISTRY_BATCH_COUNT,
  SOVEREIGN_ANCHOR,
  registryBatch,
  type DirectoryModel,
} from "@/lib/ai-registry";

function EqBars({ color }: { color: string }) {
  return (
    <div className="flex h-4 items-end gap-[3px]" style={{ color }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="eq-bar"
          style={{ animationDelay: `${i * 0.18}s`, height: 6 + ((i * 3) % 8) }}
        />
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  online: "ONLINE",
  connected: "CONNECTED",
  standby: "STANDBY",
  degraded: "DEGRADED",
  offline: "OFFLINE",
};

/** One directory card — identical visual language to the original grid. */
function ModelCard({ m, i }: { m: DirectoryModel; i: number }) {
  return (
    <div
      className="model-card panel panel-soft relative flex flex-col gap-2 p-3.5 text-left"
      style={
        {
          "--card-accent": m.accent,
          "--card-glow": `${m.accent}55`,
          animationDelay: `${i * 60}ms`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 flex-none place-items-center rounded-xl border"
          style={{
            color: m.accent,
            borderColor: `${m.accent}66`,
            background: `radial-gradient(circle at 50% 30%, ${m.accent}26, rgba(0,0,0,.7))`,
            boxShadow: `0 0 16px ${m.accent}40, inset 0 0 10px ${m.accent}22`,
          }}
        >
          <ModelGlyph name={m.glyph} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[13px] font-black tracking-wide text-white">
            {m.name}
          </div>
          <div className="truncate font-mono2 text-[9px] tracking-wider text-slate-400">
            {m.vendor}
          </div>
        </div>
      </div>

      <div className="font-display text-[10px] font-bold tracking-[0.14em]" style={{ color: m.accent }}>
        {m.role}
      </div>

      <p className="text-[11px] leading-snug text-slate-300/90 line-clamp-2">{m.description}</p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 font-mono2 text-[9px] tracking-wider text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: m.accent }}>
          <span
            className={`status-dot ${m.status === "standby" ? "pulse-soft" : ""}`}
            style={{ background: m.accent, color: m.accent }}
          />
          {STATUS_TEXT[m.status] ?? m.status.toUpperCase()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3" /> {m.contextWindow}
        </span>
        <span>{m.latencyMs}ms</span>
        {m.selfHosted && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <MapPin className="h-3 w-3" /> self-hosted
          </span>
        )}
        <span className="ml-auto">
          <EqBars color={m.accent} />
        </span>
      </div>
    </div>
  );
}

export function ModelGrid() {
  // Anchor is permanent; the window cycles through the entire registry.
  const [batch, setBatch] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setBatch((b) => {
        setLeaving(b);
        return (b + 1) % REGISTRY_BATCH_COUNT;
      });
    }, BATCH_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), 760);
    return () => clearTimeout(t);
  }, [leaving]);

  const window = registryBatch(batch);
  const leavingWindow = leaving === null ? null : registryBatch(leaving);
  const liveCount = AI_REGISTRY.filter((m) => ["online", "connected"].includes(m.status)).length;

  return (
    <Panel id="systems" className="mx-auto max-w-[1200px] px-3 py-4 sm:px-5">
      <div className="flex flex-col items-center gap-1">
        <PanelTitle>MULTI-MODEL INTELLIGENCE GRID</PanelTitle>
        <p className="font-mono2 text-[9px] tracking-[0.28em] text-slate-400 sm:text-[10px]">
          {liveCount}/{AI_REGISTRY.length} GLOBAL AI SYSTEMS OPERATIONAL · LIVE DIRECTORY CYCLE
        </p>
      </div>

      {/* ── permanently anchored sovereign core — never rotates ── */}
      <div
        className="model-card panel panel-soft relative mt-4 flex flex-col gap-2 p-3.5 text-left sm:flex-row sm:items-center sm:gap-4"
        style={
          {
            "--card-accent": SOVEREIGN_ANCHOR.accent,
            "--card-glow": `${SOVEREIGN_ANCHOR.accent}55`,
          } as React.CSSProperties
        }
      >
        <span
          className="absolute -top-2.5 left-3 rounded px-2 py-0.5 font-display text-[8px] font-black tracking-[0.2em] text-black"
          style={{ background: SOVEREIGN_ANCHOR.accent, boxShadow: `0 0 12px ${SOVEREIGN_ANCHOR.accent}` }}
        >
          ★ SOVEREIGN CORE · ANCHORED
        </span>
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border"
            style={{
              color: SOVEREIGN_ANCHOR.accent,
              borderColor: `${SOVEREIGN_ANCHOR.accent}66`,
              background: `radial-gradient(circle at 50% 30%, ${SOVEREIGN_ANCHOR.accent}26, rgba(0,0,0,.7))`,
              boxShadow: `0 0 16px ${SOVEREIGN_ANCHOR.accent}40, inset 0 0 10px ${SOVEREIGN_ANCHOR.accent}22`,
            }}
          >
            <ModelGlyph name={SOVEREIGN_ANCHOR.glyph} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-black tracking-wide text-white">
              {SOVEREIGN_ANCHOR.name}
            </div>
            <div className="truncate font-mono2 text-[9px] tracking-wider text-slate-400">
              {SOVEREIGN_ANCHOR.vendor} · {SOVEREIGN_ANCHOR.role}
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-amber-200/80 sm:max-w-md">
          Self-hosted Mistral engine — ownership, not dependency on third-party AI APIs. Apache 2.0,
          global nodes in six nations.
        </p>
        <div className="flex items-center gap-x-3 gap-y-1 font-mono2 text-[9px] tracking-wider text-slate-400 sm:ml-auto">
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: SOVEREIGN_ANCHOR.accent }}>
            <span className="status-dot" style={{ background: SOVEREIGN_ANCHOR.accent, color: SOVEREIGN_ANCHOR.accent }} />
            ONLINE
          </span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="h-3 w-3" /> {SOVEREIGN_ANCHOR.contextWindow}
          </span>
          <span>{SOVEREIGN_ANCHOR.latencyMs}ms</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <Anchor className="h-3 w-3" /> CORE LOCKED
          </span>
        </div>
      </div>

      {/* ── the live global window: 5 slots, sliding through the registry ── */}
      <div className="relative mt-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 font-mono2 text-[9px] tracking-[0.22em] text-slate-400">
            <RotateCw className="h-3 w-3 text-cyan-300 spin-slow" />
            GLOBAL DIRECTORY WINDOW · BATCH {batch + 1}/{REGISTRY_BATCH_COUNT} · ROTATES EVERY {Math.round(BATCH_INTERVAL_MS / 60000)} MIN
          </span>
          <span className="hidden gap-1 sm:flex">
            {Array.from({ length: REGISTRY_BATCH_COUNT }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-3.5 rounded-full transition-colors"
                style={{ background: i === batch ? "#22e08c" : "rgba(120,150,200,.25)" }}
              />
            ))}
          </span>
        </div>

        {leavingWindow && (
          <div className="batch-out pointer-events-none absolute inset-x-0 top-0 z-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {leavingWindow.map((m, i) => (
              <ModelCard key={`out-${m.id}`} m={m} i={i} />
            ))}
          </div>
        )}
        <div key={`batch-${batch}`} className="batch-in grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {window.map((m, i) => (
            <ModelCard key={m.id} m={m} i={i} />
          ))}
        </div>
      </div>
    </Panel>
  );
}
