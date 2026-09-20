"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Trash2, ShieldCheck, Plus } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";

type Device = {
  id: string;
  deviceName: string;
  userAgent: string;
  trusted: boolean;
  lastSeenAt: string;
  createdAt: string;
};

function describeDevice(): string {
  const ua = navigator.userAgent;
  const os = /Windows NT 10/.test(ua)
    ? "Windows 10/11"
    : /Windows NT/.test(ua)
      ? "Windows"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown OS";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua);
  return `${mobile ? "Mobile" : "Desktop"} · ${os} · ${browser}`;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [registered, setRegistered] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (res.ok) setDevices((await res.json()).devices ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: describeDevice(), userAgent: navigator.userAgent }),
      });
      setRegistered(true);
      load();
    })();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Remove this device from your trusted registry?")) return;
    await fetch(`/api/devices?id=${id}`, { method: "DELETE" });
    load();
  }

  async function registerAgain() {
    await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: describeDevice() + " (new)", userAgent: navigator.userAgent + "|" + Date.now() }),
    });
    load();
  }

  return (
    <SiteChrome>
      <PageHeader title="MY DEVICES" subtitle="Every browser and machine connected to your sovereign account, registered with a fingerprint and last-seen timestamp.">
        <button onClick={registerAgain} className="btn-red inline-flex items-center gap-2 px-4 py-2 text-[11px]">
          <Plus className="h-4 w-4" /> REGISTER DEVICE
        </button>
      </PageHeader>

      <div className="mx-auto max-w-[900px] px-4 py-8">
        <Panel className="mb-4 flex items-center gap-3 p-4">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <p className="text-[12.5px] text-slate-300">
            {registered
              ? "This device is registered and trusted. Heartbeats refresh every time you open the platform."
              : "Registering this device with the sovereign registry…"}
          </p>
        </Panel>

        {devices === null ? (
          <Panel className="p-10 text-center text-sm tracking-widest text-slate-500 pulse-soft">SCANNING DEVICES…</Panel>
        ) : devices.length === 0 ? (
          <Panel className="p-12 text-center text-sm text-slate-500">No devices registered.</Panel>
        ) : (
          <ul className="space-y-2.5">
            {devices.map((d, i) => (
              <li key={d.id}>
                <Panel soft corners={false} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-cyan-400/30 bg-cyan-500/10">
                    <MonitorSmartphone className="h-5 w-5 text-cyan-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-100">
                      {d.deviceName}
                      {i === 0 && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono2 text-[8px] tracking-widest text-emerald-300">CURRENT</span>}
                      {d.trusted && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono2 text-[8px] tracking-widest text-cyan-300">TRUSTED</span>}
                    </p>
                    <p className="truncate font-mono2 text-[9px] tracking-widest text-slate-500">
                      FP {d.userAgent.slice(0, 16).toUpperCase()} · LAST SEEN {new Date(d.lastSeenAt).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => remove(d.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/30 text-red-400 transition hover:bg-red-500/20" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteChrome>
  );
}
