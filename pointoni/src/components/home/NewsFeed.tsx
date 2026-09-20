"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Radio, ExternalLink } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import type { NewsItem } from "@/lib/types";

function ago(iso: string | Date, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NewsFeed({ initialItems }: { initialItems: NewsItem[] }) {
  const [items, setItems] = useState<NewsItem[]>(initialItems);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/news", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: NewsItem[] };
        if (!cancelled && data.items?.length) {
          setItems(data.items);
          setUpdatedAt(new Date());
        }
      } catch {
        /* feed keeps last known state */
      }
    }
    const t = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [paused]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))),
    [items],
  );
  const visible = activeCats.size === 0 ? items : items.filter((i) => activeCats.has(i.category));
  const now = Date.now() + tick * 0;

  return (
    <Panel className="flex h-full flex-col">
      <div className="border-b border-red-500/25 px-4 py-3 text-center">
        <h2 className="panel-title text-gold-gradient text-base sm:text-lg">LIVE AI NEWS FEED</h2>
      </div>
      <div className="flex items-center justify-between border-b border-red-500/15 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 font-display text-[12px] font-black tracking-[0.12em] text-cyan-300" style={{ textShadow: "0 0 10px rgba(57,215,255,.4)" }}>
          <Radio className="h-4 w-4" />
          LIVE AI MODEL UPDATES
        </span>
        <div className="relative" ref={menuRef}>
          <button
            aria-label="Feed settings"
            onClick={() => setMenuOpen((v) => !v)}
            className={`grid h-7 w-7 place-items-center rounded-md border border-slate-500/40 text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-200 ${menuOpen ? "border-cyan-400/70 text-cyan-200" : ""}`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-red-500/35 bg-[#0a0e16]/98 p-3 text-left shadow-[0_10px_40px_rgba(0,0,0,.8)]">
              <label className="flex cursor-pointer items-center justify-between text-[11px] font-semibold tracking-wider text-slate-200">
                LIVE POLLING
                <input
                  type="checkbox"
                  checked={!paused}
                  onChange={(e) => setPaused(!e.target.checked)}
                  className="accent-emerald-400"
                />
              </label>
              <div className="my-2 hairline" />
              <p className="mb-1.5 font-mono2 text-[9px] tracking-widest text-slate-500">FILTER CATEGORY</p>
              <div className="space-y-1">
                {categories.map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={activeCats.has(c)}
                      onChange={() =>
                        setActiveCats((prev) => {
                          const next = new Set(prev);
                          next.has(c) ? next.delete(c) : next.add(c);
                          return next;
                        })
                      }
                      className="accent-cyan-400"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ul className="scanline relative flex-1 divide-y divide-white/5 overflow-y-auto">
        {visible.map((n) => (
          <li key={n.id}>
            <a
              href={n.url ?? "#news"}
              onClick={(e) => !n.url && e.preventDefault()}
              className="news-item group flex gap-3 px-4 py-3"
              style={{ "--news-accent": n.accent } as React.CSSProperties}
            >
              <span className="mt-1.5 h-9 w-[3px] flex-none rounded-full" style={{ background: n.accent, boxShadow: `0 0 8px ${n.accent}` }} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-mono2 text-[9px] tracking-widest" style={{ color: n.accent }}>
                  {n.modelTag}
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-500">{n.category.toUpperCase()}</span>
                </span>
                <span className="mt-0.5 block text-[12.5px] font-medium leading-snug text-slate-200 transition group-hover:text-white">
                  {n.headline}
                </span>
                <span className="mt-1 flex items-center gap-2 font-mono2 text-[9px] tracking-wider text-slate-500">
                  {n.source} · {ago(n.publishedAt, now)}
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-70" />
                </span>
              </span>
            </a>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-4 py-10 text-center text-[12px] text-slate-500">
            No updates match this filter.
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between border-t border-red-500/15 px-4 py-2 font-mono2 text-[8px] tracking-[0.2em] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="status-dot !h-[6px] !w-[6px]" style={{ background: paused ? "#ffb020" : "#22e08c", color: paused ? "#ffb020" : "#22e08c" }} />
          {paused ? "FEED PAUSED" : "STREAM ACTIVE"}
        </span>
        <span>{updatedAt ? `SYNC ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "SYNC LIVE"}</span>
      </div>
    </Panel>
  );
}
