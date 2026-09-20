"use client";

import { useEffect, useState } from "react";
import { Save, Check } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import type { AiModel } from "@/lib/types";

type Profile = {
  displayName: string;
  email: string;
  preferences: { plan?: string; defaultModel?: string; notifications?: boolean };
};

export default function SettingsPage() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((d) => setProfile(d.user));
    fetch("/api/models").then((r) => r.json()).then((d) => setModels(d.models ?? []));
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: profile.displayName,
        email: profile.email,
        preferences: profile.preferences,
      }),
    });
    const data = await res.json();
    setProfile(data.user);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SiteChrome>
      <PageHeader title="SETTINGS" subtitle="Pilot profile, default intelligence system and notification preferences — stored against your account." />
      <div className="mx-auto max-w-[760px] space-y-5 px-4 py-8">
        {!profile ? (
          <Panel className="p-10 text-center text-sm tracking-widest text-slate-500 pulse-soft">LOADING PROFILE…</Panel>
        ) : (
          <>
            <Panel className="p-6">
              <h2 className="font-display text-sm font-black tracking-widest text-white">PILOT PROFILE</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-mono2 text-[10px] tracking-widest text-slate-400">DISPLAY NAME</span>
                  <input
                    className="input-dark h-11 w-full px-3 text-sm"
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono2 text-[10px] tracking-widest text-slate-400">EMAIL</span>
                  <input
                    type="email"
                    className="input-dark h-11 w-full px-3 text-sm"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                </label>
              </div>
            </Panel>

            <Panel className="p-6">
              <h2 className="font-display text-sm font-black tracking-widest text-white">INTELLIGENCE DEFAULTS</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-mono2 text-[10px] tracking-widest text-slate-400">DEFAULT MODEL</span>
                  <select
                    className="input-dark h-11 w-full px-3 text-sm"
                    value={profile.preferences.defaultModel ?? "sg16-brain"}
                    onChange={(e) =>
                      setProfile({ ...profile, preferences: { ...profile.preferences, defaultModel: e.target.value } })
                    }
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.vendor}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end pb-2">
                  <span className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <span className="text-[13px] font-semibold text-slate-200">Live news notifications</span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-emerald-400"
                      checked={profile.preferences.notifications ?? true}
                      onChange={(e) =>
                        setProfile({ ...profile, preferences: { ...profile.preferences, notifications: e.target.checked } })
                      }
                    />
                  </span>
                </label>
              </div>
            </Panel>

            <div className="flex justify-end gap-3">
              {saved && (
                <span className="inline-flex items-center gap-2 font-display text-[11px] font-bold tracking-widest text-emerald-300">
                  <Check className="h-4 w-4" /> SAVED
                </span>
              )}
              <button onClick={save} disabled={saving} className="btn-red inline-flex items-center gap-2 px-6 py-2.5 text-[11px] disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? "SAVING…" : "SAVE SETTINGS"}
              </button>
            </div>
          </>
        )}
      </div>
    </SiteChrome>
  );
}
