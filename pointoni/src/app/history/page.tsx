"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Trash2, MessageSquareText, SquarePen } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";

type SessionRow = {
  id: string;
  title: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/chat?sessions=1", { cache: "no-store" });
    if (!res.ok) {
      setError("Unable to load session history.");
      return;
    }
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this conversation permanently?")) return;
    const res = await fetch(`/api/chat?session=${id}`, { method: "DELETE" });
    if (res.ok) setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
  }

  return (
    <SiteChrome>
      <PageHeader title="HISTORY" subtitle="Every sovereign conversation, stored in your PostgreSQL session archive. Open a thread to continue it.">
        <Link href="/chat" className="btn-red inline-flex items-center gap-2 px-4 py-2 text-[11px]">
          <SquarePen className="h-4 w-4" /> NEW CHAT
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-[900px] px-4 py-8">
        {error && <p className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}

        {sessions === null && !error && (
          <Panel className="p-10 text-center text-sm tracking-widest text-slate-500 pulse-soft">
            RETRIEVING CONVERSATION ARCHIVE…
          </Panel>
        )}

        {sessions && sessions.length === 0 && (
          <Panel className="corner flex flex-col items-center gap-4 p-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
              <MessageSquareText className="h-8 w-8 text-cyan-300" />
            </span>
            <h2 className="font-display text-lg font-black tracking-wide text-white">NO CONVERSATIONS YET</h2>
            <p className="max-w-sm text-sm text-slate-400">
              Your chat history will appear here the moment you exchange your first message with an SG16 model.
            </p>
            <Link href="/chat" className="btn-red px-5 py-2.5 text-[11px]">START A CONVERSATION</Link>
          </Panel>
        )}

        <ul className="space-y-2.5">
          {(sessions ?? []).map((s) => (
            <li key={s.id}>
              <Panel soft corners={false} className="group flex items-center gap-4 px-4 py-3.5 transition hover:border-red-400/60">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-red-400/30 bg-red-500/10">
                  <MessageSquareText className="h-5 w-5 text-red-300" />
                </span>
                <Link href={`/chat?s=${s.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-slate-100 group-hover:text-white">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block font-mono2 text-[9px] tracking-widest text-slate-500">
                    {s.id.slice(0, 8).toUpperCase()} · MODEL {s.modelId.toUpperCase()} ·{" "}
                    {new Date(s.updatedAt).toLocaleString()}
                  </span>
                </Link>
                <Link
                  href={`/chat?s=${s.id}`}
                  className="btn-ghost hidden px-3 py-1.5 text-[10px] sm:inline-block"
                >
                  OPEN
                </Link>
                <button
                  onClick={() => remove(s.id)}
                  aria-label="Delete session"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/30 text-red-400 transition hover:bg-red-500/20 hover:text-red-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Panel>
            </li>
          ))}
        </ul>
      </div>
    </SiteChrome>
  );
}
