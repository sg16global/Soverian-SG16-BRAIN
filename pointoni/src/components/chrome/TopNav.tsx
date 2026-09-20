"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, Grid2x2, Menu } from "lucide-react";
import { TOP_LINKS } from "./nav-items";
import { useState } from "react";

export function TopNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const [online] = useState(true);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[58px] border-b border-red-500/35 bg-[#070a10]/90 shadow-[0_2px_24px_rgba(255,31,46,.25)] backdrop-blur-md">
      <div className="flex h-full items-center gap-3 px-3 sm:px-4">
        {/* Brand */}
        <Link href="/" className="flex flex-none items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/60 bg-gradient-to-b from-red-600/40 to-red-900/40 shadow-[0_0_14px_rgba(255,31,46,.5)]">
            <Crown className="h-5 w-5 text-amber-300" fill="#f5c44c" strokeWidth={2} />
          </span>
          <span className="leading-none">
            <span className="block font-mono2 text-[8px] tracking-[0.28em] text-cyan-300/80 sm:text-[9px]">
              AUSTRALBRAIN.COM
            </span>
            <span className="block font-display text-[13px] font-black tracking-wider text-white sm:text-[15px]">
              SOVEREIGN <span className="text-red-500" style={{ textShadow: "0 0 12px rgba(255,31,46,.8)" }}>SG16</span> BRAIN
            </span>
            <span className="hidden font-mono2 text-[7px] tracking-[0.22em] text-slate-400 sm:block">
              KNOWLEDGE &nbsp;·&nbsp; DIPLOMACY &nbsp;·&nbsp; A BETTER TOMORROW
            </span>
          </span>
        </Link>

        {/* Center links */}
        <nav className="mx-auto hidden items-center gap-1 xl:flex">
          {TOP_LINKS.map((l) => {
            const isHash = l.href.includes("#");
            const active = isHash
              ? pathname === "/"
              : l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            const isHome = l.label === "Home";
            return (
              <Link
                key={l.label}
                href={l.href}
                className={`rounded-md px-3 py-1.5 font-display text-[12px] font-bold tracking-wider transition-all ${
                  active || isHome
                    ? "bg-gradient-to-b from-red-600 to-red-800 text-white shadow-[0_0_14px_rgba(255,31,46,.55)]"
                    : "text-slate-300 hover:bg-red-500/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-2 xl:ml-0">
          <span
            className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 font-display text-[10px] font-bold tracking-widest sm:inline-flex ${
              online
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300 shadow-[0_0_14px_rgba(34,224,140,.3)]"
                : "border-red-400/50 bg-red-500/10 text-red-300"
            }`}
          >
            <span className="status-dot" style={{ background: online ? "#22e08c" : "#ff3b4c", color: online ? "#22e08c" : "#ff3b4c" }} />
            GLOBAL ONLINE
          </span>
          <Link
            href="/chat"
            className="btn-gold hidden px-3.5 py-1.5 text-[11px] sm:inline-block"
          >
            Get Started
          </Link>
          <button
            onClick={onMenu}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/40 bg-red-950/40 text-white transition hover:bg-red-500/20 xl:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            href="/chat"
            aria-label="Application grid"
            className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/40 bg-red-950/40 text-white transition hover:bg-red-500/20"
          >
            <Grid2x2 className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
