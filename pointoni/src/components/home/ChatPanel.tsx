"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Mic,
  MicOff,
  Plus,
  SendHorizonal,
  SquarePen,
  AlertTriangle,
  Server,
} from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui/Panel";
import { ModelGlyph } from "@/components/ModelGlyph";
import { SUGGESTION_PROMPTS } from "@/lib/content";
import { identityHeaders } from "@/lib/browser-identity";
import type { ChatMessageDto } from "@/lib/types";

// Chat uses the configured SG16 gateway. The active Python core is a limited
// deterministic structural engine, not a general-purpose language model.
const SOVEREIGN = {
  id: "sg16-brain",
  name: "SG16 Brain",
  vendor: "Sovereign Systems",
  role: "Deterministic structural core · limited coverage",
  glyph: "brain",
  accent: "#22e08c",
};

type MessageView = ChatMessageDto & { pending?: boolean };

function renderContent(text: string) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  return parts.map((part, i) => {
    if (i % 3 === 1) return null;
    if (i % 3 === 2) {
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg border border-cyan-500/25 bg-black/70 p-3 font-mono2 text-[12px] leading-relaxed text-cyan-100"
        >
          <code>{part.replace(/\n$/, "")}</code>
        </pre>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({
  full = false,
  initialSessionId,
}: {
  full?: boolean;
  initialSessionId?: string;
}) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  // sovereign identity from THIS device (email-only token, user-held)
  const [identity, setIdentity] = useState<{ token: string; email: string; plan: string | null } | null>(null);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/brain?session=${encodeURIComponent(id)}`, {
      headers: identityHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { messages: ChatMessageDto[] };
    setMessages(data.messages);
    setSessionId(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("sg16/identity");
        if (raw) {
          const s = JSON.parse(raw) as { token?: string; email?: string };
          const token = s.token;
          if (token && s.email) {
            fetch("/api/identity", {
              method: "POST",
              headers: identityHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ action: "me" }),
              cache: "no-store",
            }).then(async (response) => {
              const current = await response.json();
              if (response.ok && current.ok) {
                setIdentity({ token, email: current.email, plan: current.plan ?? null });
              } else if (response.status === 401) {
                localStorage.removeItem("sg16/identity");
              }
            }).catch(() => undefined);
          }
        }
      } catch { /* device storage unavailable */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (initialSessionId) loadSession(initialSessionId);
  }, [initialSessionId, loadSession]);

  // Instant jump to bottom on new messages — no smooth-scroll page sneaking.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function newChat() {
    const previous = sessionId;
    setMessages([]);
    setSessionId(null);
    setError(null);
    setInput("");
    if (previous) {
      // Best-effort host-side context reset; DB history is separate.
      void fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgetSessionId: previous }),
      }).catch(() => undefined);
    }
  }

  async function send(raw?: string) {
    const message = (raw ?? input).trim();
    if (!message || sending) return;
    setError(null);
    setSending(true);
    setShowSuggestions(false);
    setInput("");
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sessionId: sessionId ?? "new",
        role: "user",
        content: message,
        modelId: SOVEREIGN.id,
        relay: false,
        latencyMs: 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: identityHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ sessionId, modelId: SOVEREIGN.id, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.retryAt) {
          const waitSec = Math.max(1, Math.ceil((Number(data.retryAt) - Date.now()) / 1000));
          throw new Error(
            `${data.error || "Fair-use pause active."} You can try again in about ${waitSec}s. Your text was kept in the composer history view.`,
          );
        }
        throw new Error(data.error || "The SG16 core is unreachable. Try again.");
      }
      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        data.userMessage as ChatMessageDto,
        data.assistantMessage as ChatMessageDto,
      ]);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSending(false);
    }
  }

  function toggleMic() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      setError("Voice input is not supported by this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (e: SpeechResultEvent) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setInput((v) => (v ? `${v} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Voice capture failed. Check microphone permissions.");
    };
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  return (
    <Panel
      id="chat"
      className={`flex flex-col overflow-hidden ${
        full ? "h-[calc(100svh-240px)] min-h-[560px]" : "h-[540px]"
      }`}
    >
      {/* ── header ── */}
      <div className="relative flex flex-none items-center justify-center border-b border-red-500/25 px-4 py-3">
        <PanelTitle>CHAT PANEL</PanelTitle>
        <button
          onClick={newChat}
          className="absolute right-3 inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 font-display text-[9px] font-bold tracking-widest text-cyan-200 transition hover:bg-cyan-500/20"
          title="Start a new conversation"
        >
          <SquarePen className="h-3.5 w-3.5" /> NEW
        </button>
      </div>

      {/* ── sovereign identity strip — static, exclusive core ── */}
      <div className="flex-none px-3 pt-3">
        <div
          className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5"
          style={{
            borderColor: `${SOVEREIGN.accent}66`,
            background: `linear-gradient(90deg, ${SOVEREIGN.accent}14, rgba(8,12,19,.9))`,
          }}
        >
          <span
            className="grid h-7 w-7 flex-none place-items-center rounded-md border"
            style={{ color: SOVEREIGN.accent, borderColor: `${SOVEREIGN.accent}55`, background: `${SOVEREIGN.accent}18` }}
          >
            <ModelGlyph name={SOVEREIGN.glyph} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[11px] font-black tracking-wide text-white">
              {SOVEREIGN.name}
            </span>
            <span className="block truncate font-mono2 text-[9px] text-slate-400">
              {SOVEREIGN.vendor} · {SOVEREIGN.role}
            </span>
          </span>
          <span className="flex-none inline-flex items-center gap-1.5 font-mono2 text-[9px] tracking-wider text-emerald-300">
            <span className="status-dot" style={{ background: SOVEREIGN.accent, color: SOVEREIGN.accent }} />
            LIMITED
          </span>
          <span className="hidden flex-none font-mono2 text-[9px] text-slate-400 sm:block">8K CHAR LIMIT · HOST GATEWAY</span>
          {identity?.plan ? (
            <Link
              href="/login"
              className="flex-none rounded border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 font-mono2 text-[8px] font-black tracking-[0.14em] text-amber-300"
              title="Work mode active — bound subscription"
            >
              WORK MODE
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex-none rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono2 text-[8px] font-black tracking-[0.14em] text-cyan-300 transition hover:bg-cyan-500/20"
              title="Sign in with your email to vault passes and lift fair-use limits"
            >
              {identity ? "SIGN-IN ✓" : "FREE · SIGN IN"}
            </Link>
          )}
        </div>
      </div>

      {/* ── message viewport — in-flow, flex-1, clean scroll ── */}
      <div className="relative mx-3 mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/5 bg-black/30">
        <div
          ref={scrollRef}
          className="chat-scroll h-full overflow-y-auto px-3 py-3"
          style={{ overscrollBehavior: "contain" }}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_30px_rgba(57,215,255,.32)]">
                <BrainCircuit className="h-8 w-8 text-cyan-300" strokeWidth={1.6} />
              </span>
              <div className="font-display text-lg font-black tracking-[0.22em] text-cyan-300" style={{ textShadow: "0 0 12px rgba(57,215,255,.55)" }}>
                SG16
              </div>
              <div className="font-display text-base font-bold tracking-wide text-white sm:text-lg">
                Welcome to SG16 Developer Pilot
              </div>
              <p className="max-w-md text-[13px] font-medium leading-relaxed text-slate-200">
                Ask a focused question. This build handles a limited set of curated facts, arithmetic, and English-first planning; it may defer questions outside that scope.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[92%] flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 px-1 font-mono2 text-[10px] tracking-wider text-slate-400">
                      {m.role === "assistant" ? (
                        <>
                          <ModelGlyph name={SOVEREIGN.glyph} className="h-3 w-3" />
                          <span className="font-bold" style={{ color: SOVEREIGN.accent }}>{SOVEREIGN.name}</span>
                          <span>{timeLabel(m.createdAt)}</span>
                          <span>{m.latencyMs}ms</span>
                          {m.relay && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">
                              <Server className="h-2.5 w-2.5" /> RELAY
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-red-300">PILOT</span>
                          <span>{timeLabel(m.createdAt)}</span>
                        </>
                      )}
                    </div>
                    <div
                      className={`${m.role === "user" ? "msg-user" : "msg-bubble"} px-4 py-2.5 text-[14px] font-medium leading-relaxed`}
                    >
                      {renderContent(m.content)}
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="msg-bubble flex items-center gap-1.5 px-4 py-3">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="ml-2 font-mono2 text-[10px] tracking-widest text-cyan-300">
                      {SOVEREIGN.name.toUpperCase()} IS THINKING…
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <span className="scanline" aria-hidden />
      </div>

      {/* ── error + suggestions dock ── */}
      {error && (
        <div className="mx-3 mt-2 flex flex-none items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 flex-none" /> {error}
          <button onClick={() => setError(null)} className="ml-auto font-bold underline">dismiss</button>
        </div>
      )}

      {showSuggestions && (
        <div className="mx-3 mt-2 grid flex-none gap-1.5 rounded-lg border border-cyan-400/25 bg-black/50 p-2 sm:grid-cols-2">
          {SUGGESTION_PROMPTS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── composer — pinned bottom ── */}
      <div className="mt-3 flex-none border-t border-red-500/20 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            aria-label="Suggested prompts"
            className={`grid h-10 w-10 flex-none place-items-center rounded-lg border transition ${
              showSuggestions
                ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-200"
                : "border-slate-500/40 bg-black/50 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
            }`}
          >
            <Plus className="h-5 w-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Start by typing your message below…"
            className="input-dark h-10 flex-1 px-3 text-[13px]"
          />
          <button
            onClick={toggleMic}
            aria-label="Voice input"
            className={`grid h-10 w-10 flex-none place-items-center rounded-lg border transition ${
              listening
                ? "border-red-400/80 bg-red-500/30 text-red-200 pulse-soft"
                : "border-slate-500/40 bg-black/50 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
            }`}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="btn-red grid h-10 w-11 flex-none place-items-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendHorizonal className="h-5 w-5" />
          </button>
        </div>
        {sessionId && (
          <p className="mt-1.5 flex items-center justify-center gap-2 text-center font-mono2 text-[8px] tracking-[0.2em] text-slate-500">
            SESSION {sessionId.slice(0, 8).toUpperCase()} · HOST GATEWAY CHANNEL
          </p>
        )}
      </div>
    </Panel>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechResultEvent = { results: { [k: number]: { [k: number]: { transcript: string } } } };
