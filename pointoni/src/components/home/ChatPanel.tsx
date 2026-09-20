"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
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
import { SELECT_EVENT } from "./ModelGrid";
import { SUGGESTION_PROMPTS } from "@/lib/content";
import type { AiModel, ChatMessageDto } from "@/lib/types";

type MessageView = ChatMessageDto & { pending?: boolean };

function renderContent(text: string) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  return parts.map((part, i) => {
    if (i % 3 === 1) return null;
    if (i % 3 === 2) {
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg border border-cyan-500/25 bg-black/70 p-3 font-mono2 text-[11px] leading-relaxed text-cyan-100"
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
  models,
  full = false,
  initialSessionId,
}: {
  models: AiModel[];
  full?: boolean;
  initialSessionId?: string;
}) {
  const [modelId, setModelId] = useState("sg16-brain");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const model = models.find((m) => m.id === modelId) ?? models[0];

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (models.some((m) => m.id === id)) setModelId(id);
    };
    window.addEventListener(SELECT_EVENT, handler);
    return () => window.removeEventListener(SELECT_EVENT, handler);
  }, [models]);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat?session=${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: ChatMessageDto[] };
    setMessages(data.messages);
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (initialSessionId) loadSession(initialSessionId);
  }, [initialSessionId, loadSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function newChat() {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setInput("");
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
        modelId,
        relay: false,
        latencyMs: 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, modelId, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The SG16 core is unreachable. Try again.");
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
    rec.lang = "en-US";
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
    <Panel id="chat" className={`flex flex-col ${full ? "h-[calc(100vh-220px)] min-h-[460px]" : ""}`}>
      <div className="relative flex items-center justify-center border-b border-red-500/25 px-4 py-3">
        <PanelTitle>CHAT PANEL</PanelTitle>
        <button
          onClick={newChat}
          className="absolute right-3 inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 font-display text-[9px] font-bold tracking-widest text-cyan-200 transition hover:bg-cyan-500/20"
          title="Start a new conversation"
        >
          <SquarePen className="h-3.5 w-3.5" /> NEW
        </button>
      </div>

      {/* model selector */}
      <div className="relative px-3 pt-3">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition"
          style={{
            borderColor: `${model.accent}66`,
            background: `linear-gradient(90deg, ${model.accent}14, rgba(8,12,19,.9))`,
          }}
        >
          <span className="grid h-7 w-7 place-items-center rounded-md border" style={{ color: model.accent, borderColor: `${model.accent}55`, background: `${model.accent}18` }}>
            <ModelGlyph name={model.glyph} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[11px] font-black tracking-wide text-white">
              {model.name}
            </span>
            <span className="block truncate font-mono2 text-[9px] text-slate-400">
              {model.vendor} · {model.role}
            </span>
          </span>
          <span className="hidden font-mono2 text-[9px] text-slate-400 sm:block">
            {model.latencyMs}ms · {model.contextWindow}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        {pickerOpen && (
          <div className="absolute inset-x-3 top-[calc(100%-4px)] z-30 max-h-72 overflow-y-auto rounded-lg border border-red-500/35 bg-[#0a0e16]/98 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,.8),0_0_24px_rgba(255,31,46,.2)] backdrop-blur">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModelId(m.id);
                  window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: m.id }));
                  setPickerOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition hover:bg-white/5 ${m.id === modelId ? "bg-white/5" : ""}`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-md border" style={{ color: m.accent, borderColor: `${m.accent}55`, background: `${m.accent}16` }}>
                  <ModelGlyph name={m.glyph} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[11px] font-bold text-white">{m.name}</span>
                  <span className="block truncate font-mono2 text-[9px] text-slate-400">{m.vendor}</span>
                </span>
                <span className="status-dot" style={{ background: m.accent, color: m.accent }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className={`relative scanline mt-3 overflow-y-auto px-3 ${full ? "flex-1" : "h-[320px] sm:h-[360px]"}`}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_34px_rgba(57,215,255,.35)]">
              <BrainCircuit className="h-10 w-10 text-cyan-300" strokeWidth={1.6} />
            </span>
            <div className="font-display text-xl font-black tracking-[0.2em] text-cyan-300" style={{ textShadow: "0 0 14px rgba(57,215,255,.6)" }}>
              SG16
            </div>
            <div className="font-display text-lg font-bold tracking-wide text-cyan-200 sm:text-xl">
              Welcome to SG16 Developer Pilot
            </div>
            <p className="text-sm font-medium text-slate-300">
              Your AI-powered development partner.
              <br />
              Ask anything, build anything, solve anything.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] ${m.role === "user" ? "msg-user" : "msg-bubble"} rounded-xl px-3.5 py-2.5`}>
                  <div className="mb-1 flex items-center gap-2 font-mono2 text-[9px] tracking-wider text-slate-400">
                    {m.role === "assistant" ? (
                      <>
                        <ModelGlyph name={models.find((x) => x.id === m.modelId)?.glyph ?? "brain"} className="h-3 w-3" />
                        <span style={{ color: models.find((x) => x.id === m.modelId)?.accent ?? "#39d7ff" }}>
                          {models.find((x) => x.id === m.modelId)?.name ?? "SG16"}
                        </span>
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
                        <span className="text-red-300">PILOT</span>
                        <span>{timeLabel(m.createdAt)}</span>
                      </>
                    )}
                  </div>
                  <div className="text-[13px] leading-relaxed text-slate-100">{renderContent(m.content)}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="msg-bubble flex items-center gap-1.5 rounded-xl px-4 py-3">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="ml-2 font-mono2 text-[10px] tracking-widest text-cyan-300">
                    {model.name.toUpperCase()} IS THINKING…
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 flex-none" /> {error}
          <button onClick={() => setError(null)} className="ml-auto font-bold underline">dismiss</button>
        </div>
      )}

      {showSuggestions && (
        <div className="mx-3 mt-2 grid gap-1.5 rounded-lg border border-cyan-400/25 bg-black/50 p-2 sm:grid-cols-2">
          {SUGGESTION_PROMPTS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <div className="border-t border-red-500/20 p-3">
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
          <p className="mt-1.5 text-center font-mono2 text-[8px] tracking-[0.2em] text-slate-500">
            SESSION {sessionId.slice(0, 8).toUpperCase()} · ENCRYPTED SOVEREIGN CHANNEL
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
