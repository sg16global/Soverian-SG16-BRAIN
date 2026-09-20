"use client";

import { useEffect, useState } from "react";
import { Check, Cpu, MapPin } from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui/Panel";
import { ModelGlyph } from "@/components/ModelGlyph";
import type { AiModel } from "@/lib/types";

export const SELECT_EVENT = "sg16:select-model";

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

export function ModelGrid({ models }: { models: AiModel[] }) {
  const [selected, setSelected] = useState("sg16-brain");

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") setSelected(id);
    };
    window.addEventListener(SELECT_EVENT, handler);
    return () => window.removeEventListener(SELECT_EVENT, handler);
  }, []);

  function choose(id: string) {
    setSelected(id);
    window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: id }));
    document.getElementById("chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const liveCount = models.filter((m) => ["online", "connected"].includes(m.status)).length;

  return (
    <Panel id="systems" className="mx-auto max-w-[1200px] px-3 py-4 sm:px-5">
      <div className="flex flex-col items-center gap-1">
        <PanelTitle>MULTI-MODEL INTELLIGENCE GRID</PanelTitle>
        <p className="font-mono2 text-[9px] tracking-[0.28em] text-slate-400 sm:text-[10px]">
          {liveCount}/{models.length} AI SYSTEMS OPERATIONAL · UNITED BY THE SG16 ORCHESTRATOR
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {models.map((m, i) => {
          const isSelected = selected === m.id;
          const featured = m.id === "sg16-brain";
          return (
            <button
              key={m.id}
              onClick={() => choose(m.id)}
              className={`model-card panel panel-soft relative flex flex-col gap-2 p-3.5 text-left ${
                featured ? "sm:col-span-2" : ""
              } ${isSelected ? "selected" : ""}`}
              style={
                {
                  "--card-accent": m.accent,
                  "--card-glow": `${m.accent}55`,
                  animationDelay: `${i * 60}ms`,
                } as React.CSSProperties
              }
            >
              {featured && (
                <span
                  className="absolute -top-2.5 left-3 rounded px-2 py-0.5 font-display text-[8px] font-black tracking-[0.2em] text-black"
                  style={{ background: m.accent, boxShadow: `0 0 12px ${m.accent}` }}
                >
                  ★ SOVEREIGN CORE
                </span>
              )}
              {isSelected && (
                <span
                  className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full text-black"
                  style={{ background: m.accent }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}

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

              {featured && (
                <p className="hidden text-[11px] leading-snug text-amber-200/80 sm:block">
                  Self-hosted Mistral engine — ownership, not dependency on third-party AI APIs. Apache 2.0,
                  global nodes in six nations.
                </p>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 font-mono2 text-[9px] tracking-wider text-slate-400">
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: m.accent }}
                >
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
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
