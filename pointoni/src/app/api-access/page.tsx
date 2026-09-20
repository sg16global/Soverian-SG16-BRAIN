"use client";

import { useEffect, useState } from "react";
import { KeyRound, Copy, Trash2, Eye, EyeOff, Terminal, ShieldCheck } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";

type Token = {
  id: string;
  label: string;
  prefix: string;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function ApiAccessPage() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCurl, setShowCurl] = useState(true);

  async function load() {
    const res = await fetch("/api/tokens", { cache: "no-store" });
    if (res.ok) setTokens((await res.json()).tokens ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setCreating(true);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() || "Developer Pilot Token" }),
    });
    const data = await res.json();
    if (res.ok) {
      setSecret(data.secret);
      setLabel("");
      load();
    }
    setCreating(false);
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Applications using it will stop working immediately.")) return;
    await fetch(`/api/tokens?id=${id}`, { method: "DELETE" });
    load();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const curl = `curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://your-deployment"}/api/chat \\\n  -H "Authorization: Bearer ${secret ?? "sg16_your_token_here"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"modelId":"sg16-brain","message":"Hello SG16"}'`;

  return (
    <SiteChrome>
      <PageHeader title="API ACCESS" subtitle="Programmatic access to the sovereign chat core and multi-model orchestrator. Tokens are hashed with SHA-256 — the full secret is shown only once." />

      <div className="mx-auto max-w-[900px] space-y-5 px-4 py-8">
        <Panel className="p-5">
          <h2 className="font-display text-sm font-black tracking-widest text-white">CREATE A TOKEN</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Token label (e.g. production-web)"
              className="input-dark h-11 flex-1 px-3 text-sm"
            />
            <button onClick={create} disabled={creating} className="btn-red inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[11px] disabled:opacity-50">
              <KeyRound className="h-4 w-4" /> {creating ? "GENERATING…" : "GENERATE TOKEN"}
            </button>
          </div>

          {secret && (
            <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 font-display text-[10px] font-black tracking-widest text-amber-300">
                <Eye className="h-4 w-4" /> COPY THIS TOKEN NOW — IT WILL NOT BE SHOWN AGAIN
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-white/15 bg-black/70 px-3 py-2 font-mono2 text-[12px] text-emerald-300">{secret}</code>
                <button onClick={() => copy(secret)} className="btn-gold px-3 py-2 text-[10px]">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {copied && <p className="mt-1 font-mono2 text-[10px] text-emerald-400">Copied to clipboard.</p>}
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <button onClick={() => setShowCurl((v) => !v)} className="flex w-full items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-black tracking-widest text-white">
              <Terminal className="h-4 w-4 text-cyan-300" /> QUICK START
            </h2>
            {showCurl ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-slate-400" />}
          </button>
          {showCurl && (
            <pre className="mt-3 overflow-x-auto rounded-lg border border-cyan-500/25 bg-black/75 p-4 font-mono2 text-[11px] leading-relaxed text-cyan-100">
              {curl}
            </pre>
          )}
          <p className="mt-3 flex items-start gap-2 text-[12px] text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
            Responses include the model id, measured latency and a <span className="font-mono2 text-amber-300">relay</span> flag indicating whether the answer stayed inside the sovereign boundary.
          </p>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-sm font-black tracking-widest text-white">ACTIVE TOKENS</h2>
          <div className="mt-3">
            {tokens === null ? (
              <p className="py-8 text-center text-sm tracking-widest text-slate-500 pulse-soft">LOADING TOKENS…</p>
            ) : tokens.filter((t) => !t.revoked).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No active tokens. Generate one above to begin integrating.</p>
            ) : (
              <ul className="space-y-2">
                {tokens.filter((t) => !t.revoked).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <KeyRound className="h-4 w-4 flex-none text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-100">{t.label}</p>
                      <p className="font-mono2 text-[10px] tracking-widest text-slate-500">
                        {t.prefix} · CREATED {new Date(t.createdAt).toLocaleDateString()}
                        {t.lastUsedAt ? ` · LAST USED ${new Date(t.lastUsedAt).toLocaleString()}` : " · NEVER USED"}
                      </p>
                    </div>
                    <button onClick={() => revoke(t.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/30 text-red-400 transition hover:bg-red-500/20" title="Revoke">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </SiteChrome>
  );
}
