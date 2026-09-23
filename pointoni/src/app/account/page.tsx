"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessagesSquare, FolderClosed, KeyRound, MonitorSmartphone, ChevronRight } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { identityHeaders } from "@/lib/browser-identity";

type Profile = {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  preferences: { defaultModel?: string };
};

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ sessions: number; files: number; tokens: number; devices: number }>({
    sessions: 0,
    files: 0,
    tokens: 0,
    devices: 0,
  });

  useEffect(() => {
    const headers = identityHeaders();
    fetch("/api/profile", { headers, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sign in to view your account.");
        setProfile(data.user);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load account."));
    Promise.all([
      fetch("/api/chat?sessions=1", { headers }).then((r) => r.json()).catch(() => ({ sessions: [] })),
      fetch("/api/files", { headers }).then((r) => r.json()).catch(() => ({ files: [] })),
      fetch("/api/tokens", { headers }).then((r) => r.json()).catch(() => ({ tokens: [] })),
      fetch("/api/devices", { headers }).then((r) => r.json()).catch(() => ({ devices: [] })),
    ]).then(([s, f, t, d]) => {
      setCounts({
        sessions: (s.sessions ?? []).length,
        files: (f.files ?? []).length,
        tokens: (t.tokens ?? []).filter((x: { revoked: boolean }) => !x.revoked).length,
        devices: (d.devices ?? []).length,
      });
    });
  }, []);

  const cards = [
    { label: "Conversations", value: counts.sessions, icon: MessagesSquare, href: "/history", accent: "#39d7ff" },
    { label: "Stored files", value: counts.files, icon: FolderClosed, href: "/files", accent: "#22e08c" },
    { label: "Active tokens", value: counts.tokens, icon: KeyRound, href: "/api-access", accent: "#ffd166" },
    { label: "Devices", value: counts.devices, icon: MonitorSmartphone, href: "/devices", accent: "#ff8a3d" },
  ];

  return (
    <SiteChrome>
      <PageHeader title="ACCOUNT" subtitle="Your verified account and data stored by this deployment." />
      <div className="mx-auto max-w-[900px] space-y-5 px-4 py-8">
        {error && <Panel className="p-5 text-sm text-amber-200">{error} <Link href="/login" className="underline">Sign in</Link></Panel>}
        {!profile && !error ? (
          <Panel className="p-10 text-center text-sm tracking-widest text-slate-500 pulse-soft">LOADING ACCOUNT…</Panel>
        ) : profile ? (
          <Panel className="corner flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 flex-none place-items-center rounded-2xl border border-red-400/50 bg-gradient-to-b from-red-600/40 to-red-900/40 font-display text-3xl font-black text-white shadow-[0_0_28px_rgba(255,31,46,.4)]">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1">
              <h2 className="font-display text-xl font-black tracking-wide text-white">{profile.displayName}</h2>
              <p className="font-mono2 text-[11px] tracking-widest text-slate-400">{profile.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 font-mono2 text-[9px] tracking-widest text-cyan-300">
                  ROLE · {profile.role.toUpperCase()}
                </span>
                <span className="rounded-full border border-slate-500/40 px-3 py-1 font-mono2 text-[9px] tracking-widest text-slate-300">
                  PILOT SINCE {new Date(profile.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Link href="/settings" className="btn-ghost px-4 py-2 text-[11px]">EDIT PROFILE</Link>
          </Panel>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.label} href={c.href}>
              <Panel soft corners={false} className="group p-5 transition hover:border-red-400/60">
                <div className="flex items-center justify-between">
                  <c.icon className="h-7 w-7" style={{ color: c.accent }} />
                  <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-white" />
                </div>
                <p className="mt-3 font-display text-3xl font-black text-white">{c.value}</p>
                <p className="font-mono2 text-[10px] tracking-widest text-slate-400">{c.label.toUpperCase()}</p>
              </Panel>
            </Link>
          ))}
        </div>
      </div>
    </SiteChrome>
  );
}
