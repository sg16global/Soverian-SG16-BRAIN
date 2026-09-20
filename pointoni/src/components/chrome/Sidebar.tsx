"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Crown, Power } from "lucide-react";
import { SIDEBAR_LINKS } from "./nav-items";
import { GLOBAL_NODES } from "@/lib/content";
import { LiveClock } from "./LiveClock";

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "out" }),
    });
    router.push("/signed-out");
    onNavigate?.();
  }

  return (
    <div className="flex h-full flex-col bg-[#070a10]/95">
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {SIDEBAR_LINKS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`group flex items-center gap-3 rounded-lg border px-3 py-2 font-display text-[12px] font-bold tracking-wider transition-all ${
                    active
                      ? "border-red-400/60 bg-gradient-to-r from-red-600/30 to-transparent text-white shadow-[0_0_16px_rgba(255,31,46,.35)]"
                      : "border-transparent text-slate-300 hover:border-red-400/30 hover:bg-red-500/10 hover:text-white"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] flex-none ${active ? "text-red-400" : "text-slate-400 group-hover:text-red-300"}`} strokeWidth={2} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <button
          onClick={signOut}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 font-display text-[12px] font-bold tracking-wider text-red-500 transition-all hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-300"
        >
          <Power className="h-[18px] w-[18px] flex-none" strokeWidth={2.2} />
          Sign Out
        </button>

        <div className="my-4 hairline" />

        {/* mini globe */}
        <div className="mb-3 flex justify-center">
          <div className="relative h-28 w-28">
            <div className="absolute inset-0 rounded-full border border-cyan-400/30 spin-slow" style={{ borderTopColor: "rgba(57,215,255,.8)" }} />
            <div className="absolute inset-1.5 rounded-full border border-cyan-400/20 spin-rev" style={{ borderBottomColor: "rgba(255,90,60,.7)" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/globe.png"
              alt="Global network"
              className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] rounded-full object-cover"
              style={{ mixBlendMode: "screen", filter: "drop-shadow(0 0 14px rgba(57,150,255,.5))" }}
            />
          </div>
        </div>

        {/* live global clocks */}
        <div className="space-y-1.5">
          {GLOBAL_NODES.map((n) => (
            <LiveClock key={n.code} node={n} compact />
          ))}
        </div>
      </nav>

      <div className="border-t border-red-500/25 p-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 flex-none text-amber-300" fill="#f5c44c" />
          <span className="font-display text-[10px] font-black tracking-widest text-white">
            SOVEREIGN <span className="text-red-500">SG16</span> BRAIN
          </span>
        </div>
        <p className="mt-1.5 font-mono2 text-[8px] leading-relaxed tracking-wider text-slate-400">
          SG16-POWERED AI
          <br />
          GLOBAL INTELLIGENCE NETWORK
          <br />
          BUILT FOR A BRIGHTER FUTURE.
          <br />
          ONE MIND, ONE PLANET.
          <br />
          ONE SOVEREIGN BRAIN.
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed bottom-0 left-0 top-[58px] z-40 hidden w-[224px] border-r border-red-500/30 shadow-[4px_0_30px_rgba(255,31,46,.15)] xl:block">
      <SidebarBody />
    </aside>
  );
}

export function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-[60] xl:hidden ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute bottom-0 left-0 top-0 w-[270px] border-r border-red-500/40 shadow-[8px_0_40px_rgba(255,31,46,.3)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarBody onNavigate={onClose} />
      </aside>
    </div>
  );
}
