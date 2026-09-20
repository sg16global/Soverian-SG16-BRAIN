"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { History as HistoryIcon, Newspaper } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { ChatPanel } from "@/components/home/ChatPanel";
import { NewsFeed } from "@/components/home/NewsFeed";
import { ModelGrid } from "@/components/home/ModelGrid";
import type { AiModel, NewsItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";

function Workspace() {
  const params = useSearchParams();
  const sessionId = params.get("s");
  const [models, setModels] = useState<AiModel[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/news").then((r) => r.json()),
    ])
      .then(([m, n]) => {
        setModels(m.models ?? []);
        setNews(n.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="SOVEREIGN WORKSPACE"
        subtitle="Live multi-model intelligence. Select a system in the grid, then converse — every exchange is persisted to your sovereign session log."
      >
        <Link href="/history" className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[11px]">
          <HistoryIcon className="h-4 w-4" /> HISTORY
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-[1200px] px-3 py-6 sm:px-5">
        {loading || models.length === 0 ? (
          <div className="panel grid h-[420px] place-items-center text-sm tracking-widest text-slate-500">
            <span className="pulse-soft">ESTABLISHING SOVEREIGN CHANNEL…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <ModelGrid models={models} />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <ChatPanel models={models} full initialSessionId={sessionId ?? undefined} />
              <div className="h-[520px] lg:h-auto">
                <NewsFeed initialItems={news} />
              </div>
            </div>
            <p className="flex items-center justify-center gap-2 text-center font-mono2 text-[9px] tracking-[0.25em] text-slate-500">
              <Newspaper className="h-3 w-3" /> SELF-HOSTED MISTRAL ENGINE · APACHE 2.0 · OWNERSHIP, NOT DEPENDENCY
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <SiteChrome>
      <Suspense fallback={<div className="p-20 text-center text-slate-500">Loading workspace…</div>}>
        <Workspace />
      </Suspense>
    </SiteChrome>
  );
}
