"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Download,
  Gauge,
  ZapOff,
  Zap,
  SendHorizonal,
  TriangleAlert,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui/Panel";
import {
  FRIEND_WEIGHTS,
  loadFriendEngine,
  probeDevice,
  recommendWeight,
  type DeviceProbe,
  type FriendEngine,
  type FriendWeight,
} from "@/lib/local-brain";

// FRIEND ENGINE STATION — doctrine v2 step 1, live:
//   download the weight ONCE on this device → every reply generated locally
//   afterwards. Zero requests per chat turn. The user's energy does it.

type LocalMsg = { role: "user" | "assistant"; content: string; ms?: number };
type Phase = "probe" | "ready" | "loading" | "loaded" | "error";

const ACCENT = "#39d7ff";

export function LocalFriendPanel() {
  const [probe, setProbe] = useState<DeviceProbe | null>(null);
  const [pick, setPick] = useState<FriendWeight>(FRIEND_WEIGHTS[0]);
  const [phase, setPhase] = useState<Phase>("probe");
  const [progress, setProgress] = useState<{ file: string; fraction: number; mb: number; totalMb: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [engine, setEngine] = useState<FriendEngine | null>(null);
  const [chat, setChat] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const engineRef = useRef<FriendEngine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const p = await probeDevice();
      setProbe(p);
      setPick(recommendWeight(p));
      setPhase("ready");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, thinking]);

  async function ignite() {
    setErr(null);
    setPhase("loading");
    setProgress({ file: "engine core", fraction: 0, mb: 0, totalMb: 60 });
    try {
      const e = await loadFriendEngine(pick, (p) => {
        setProgress({
          file: p.file,
          fraction: p.fraction,
          mb: p.loaded / 1048576,
          totalMb: p.total / 1048576 || 60,
        });
      });
      engineRef.current = e;
      setEngine(e);
      setPhase("loaded");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "load failed");
      setPhase("error");
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !engine || thinking) return;
    setInput("");
    setThinking(true);
    setChat((prev) => [...prev, { role: "user", content: text }]);
    try {
      const { reply, ms } = await engine.chat(
        chat.map((m) => ({ role: m.role, content: m.content })),
        text,
      );
      setChat((prev) => [...prev, { role: "assistant", content: reply, ms }]);
    } catch (e) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: `[offline glitch] ${e instanceof Error ? e.message : "generation failed"}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function unload() {
    await engineRef.current?.dispose();
    engineRef.current = null;
    setEngine(null);
    setChat([]);
    setPhase("ready");
  }

  return (
    <Panel id="friend-engine" className="flex flex-col">
      <div className="relative flex items-center justify-center border-b border-red-500/25 px-4 py-3">
        <PanelTitle accent="cyan">FRIEND ENGINE · THIS DEVICE</PanelTitle>
        <span className="absolute right-3 inline-flex items-center gap-1.5 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 font-display text-[8px] font-black tracking-[0.18em] text-cyan-300">
          <ShieldCheck className="h-3 w-3" /> USER-SIDE · ZERO CHAT TRAFFIC
       </span>
      </div>
      <p className="px-5 pt-3 text-center font-mono2 text-[9px] leading-relaxed tracking-[0.2em] text-slate-400">
        DOCTRINE v2 · THE BRAIN LIVE-DOWNLOADS ONCE INTO THIS BROWSER, THEN ANSWERS FROM YOUR OWN
        ENERGY — NO REQUESTS, NO STORAGE, NO COST PER MESSAGE
      </p>

      {/* device probe strip */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono2 text-[9px] tracking-wider ${probe?.webgpu ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-amber-400/40 bg-amber-400/10 text-amber-300"}`}>
          <Gauge className="h-3 w-3" /> {probe ? (probe.webgpu ? "WebGPU ✓" : "WASM fallback") : "probing…"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2 py-1 font-mono2 text-[9px] tracking-wider text-slate-300">
          RAM ≈ {probe?.deviceMemoryGb ?? "?"} GB · {probe?.cores ?? "?"} cores
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono2 text-[9px] tracking-wider ${engine ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/5 text-slate-400"}`}>
          {engine ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
          {engine ? `RESIDENT · ${pick.params} LOCAL` : "NO WEIGHT LOADED"}
        </span>
      </div>

      {/* weight pick + load / status */}
      {phase !== "loaded" ? (
        <div className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {FRIEND_WEIGHTS.map((w) => (
              <button
                key={w.id}
                onClick={() => setPick(w)}
                className={`rounded-lg border p-3 text-left transition ${pick.id === w.id ? "border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_18px_rgba(57,215,255,.18)]" : "border-white/12 bg-black/40 hover:border-cyan-400/30"}`}
                disabled={phase === "loading"}
              >
                <div className="font-display text-[12px] font-black tracking-wider text-white">
                  {w.label} · <span style={{ color: ACCENT }}>{w.params}</span>
                </div>
                <div className="mt-0.5 font-mono2 text-[9px] tracking-wider text-slate-400">
                  first download {w.download} · cached forever · needs ≥ {w.minRam} GB
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-300/90">{w.blurb}</p>
              </button>
            ))}
          </div>

          {phase === "loading" && progress ? (
            <div className="mt-3 rounded-lg border border-cyan-400/25 bg-black/50 p-3">
              <div className="flex items-center justify-between font-mono2 text-[10px] tracking-wider text-cyan-200">
                <span className="truncate">⤓ {progress.file}</span>
                <span>{progress.mb.toFixed(1)} / {progress.totalMb.toFixed(0)} MB</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-[width] duration-150" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
              <p className="mt-1.5 font-mono2 text-[9px] tracking-[0.16em] text-slate-500">
                ONE-TIME LANDING ON THIS DEVICE — the friend moves into your cache, not our memory
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono2 text-[9px] tracking-[0.2em] text-slate-500">
                {phase === "error" ? "ENGINE DID NOT LAND" : "SELECT WEIGHT → LAND IT → CHAT FREE OF TRAFFIC"}
              </span>
              <button onClick={ignite} className="btn-red inline-flex items-center gap-2 px-5 py-2 font-display text-[10px] font-black tracking-[0.18em]">
                <Download className="h-4 w-4" /> LAND {pick.label}
              </button>
            </div>
          )}

          {phase === "error" && err && (
            <p className="mt-2 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">
              <TriangleAlert className="h-4 w-4 flex-none" /> {err}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* local chat */}
          <div className="mx-4 mt-3 min-h-0 flex-1">
            <div
              ref={scrollRef}
              className="chat-scroll h-56 overflow-y-auto rounded-xl border border-cyan-400/20 bg-black/40 px-3 py-3"
              style={{ overscrollBehavior: "contain" }}
            >
              {chat.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                  <BrainCircuit className="h-7 w-7 text-cyan-300" strokeWidth={1.5} />
                  <div className="font-display text-[13px] font-black tracking-[0.18em] text-white">
                    {pick.label} IS RESIDENT
                  </div>
                  <p className="max-w-sm font-mono2 text-[9px] leading-relaxed tracking-[0.16em] text-slate-400">
                    {pick.params} parameters, on your silicon. Airplane-mode proof: everything after
                    this point happens with the network off.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {chat.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="flex max-w-[88%] flex-col gap-1">
                        <div className="flex items-center gap-2 font-mono2 text-[9px] tracking-wider text-slate-400">
                          {m.role === "assistant" ? (
                            <>
                              <span className="font-bold" style={{ color: ACCENT }}>SG16 FRIEND</span>
                              <span>on-device</span>
                              {m.ms != null && <span>{m.ms} ms</span>}
                              <span className="rounded bg-emerald-500/15 px-1 text-[8px] font-bold text-emerald-300">0 NET</span>
                            </>
                          ) : (
                            <span className="font-bold text-red-300">YOU</span>
                          )}
                        </div>
                        <div className={`${m.role === "user" ? "msg-user" : "msg-bubble"} px-3.5 py-2 text-[13px] font-medium leading-relaxed`}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {thinking && (
                    <div className="flex justify-start">
                      <div className="msg-bubble flex items-center gap-1.5 px-4 py-3">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 px-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask the friend — it answers off your own battery…"
              className="input-dark h-10 flex-1 px-3 text-[13px]"
            />
            <button
              onClick={send}
              disabled={thinking || !input.trim()}
              aria-label="Send"
              className="btn-red grid h-10 w-11 flex-none place-items-center disabled:opacity-40"
            >
              <SendHorizonal className="h-5 w-5" />
            </button>
            <button
              onClick={unload}
              title="Drop the weight from memory (cache keeps it for free)"
              className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-white/15 text-slate-300 transition hover:border-red-400/60 hover:text-red-300"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
