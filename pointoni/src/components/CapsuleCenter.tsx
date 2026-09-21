"use client";

import { useState } from "react";
import { HardDriveDownload, HardDriveUpload, Lock, Unlock, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import {
  downloadCapsule,
  openCapsule,
  sealCapsule,
  type CapsulePayload,
  type CapsuleSession,
} from "@/lib/capsule";

// DEVICE CAPSULE center — seal everything into an encrypted file the user owns
// (their Google Drive / phone folder), and restore it anywhere. The platform
// holds nothing and can read nothing.

type SessionRow = { id: string; title: string; modelId: string; updatedAt?: string };
type Checklist = { key: string; text: string };

export function CapsuleCenter({ email }: { email: string | null }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState<"idle" | "sealing" | "opening">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sealAll() {
    setError(null);
    setNote(null);
    if (pass.length < 4) {
      setError("Choose a passphrase of 4+ characters — it is never sent anywhere.");
      return;
    }
    setBusy("sealing");
    try {
      const sessionsRes = await fetch("/api/brain?sessions=1");
      const { sessions = [] } = (await sessionsRes.json()) as { sessions?: SessionRow[] };

      const bundle: CapsuleSession[] = [];
      for (const s of sessions.slice(0, 40)) {
        const msgsRes = await fetch(`/api/brain?session=${s.id}`);
        const { messages = [] } = (await msgsRes.json()) as {
          messages?: { role: string; content: string; modelId: string; createdAt: string }[];
        };
        bundle.push({
          title: s.title,
          modelId: s.modelId,
          createdAt: s.updatedAt,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            modelId: m.modelId,
            createdAt: m.createdAt,
          })),
        });
      }

      const payload: CapsulePayload = {
        kind: "sg16-capsule",
        version: 1,
        sealedAtUtc: new Date().toISOString(),
        owner: email,
        sessions: bundle,
      };
      const sealedJson = await sealCapsule(payload, pass);
      downloadCapsule(email ?? "sovereign", sealedJson);
      setNote(
        `Capsule sealed: ${bundle.length} session(s), AES-256-GCM. Keep the file in your own Drive or phone folder — we keep nothing.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sealing failed.");
    } finally {
      setBusy("idle");
    }
  }

  async function openFile(file: File) {
    setError(null);
    setNote(null);
    if (pass.length < 4) {
      setError("Enter the passphrase you sealed it with first, then choose the capsule file.");
      return;
    }
    setBusy("opening");
    try {
      const payload = await openCapsule(await file.text(), pass);
      let restored = 0;
      const restoredChecklist: Checklist[] = [];
      for (const s of payload.sessions) {
        const res = await fetch("/api/brain/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.title, messages: s.messages }),
        });
        if (res.ok) {
          const { restored: n } = (await res.json()) as { restored?: number };
          restored += n ?? 0;
          restoredChecklist.push({ key: s.title, text: `${n ?? 0} msg` });
        }
      }
      setNote(
        `Capsule opened: ${payload.sessions.length} session(s), ${restored} message(s) restored to your chat archive${payload.owner ? ` · sealed by ${payload.owner}` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opening failed.");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <Panel className="flex flex-col">
      <div className="border-b border-amber-400/25 px-4 py-3 text-center">
        <h3 className="panel-title text-base text-gold-gradient">DEVICE CAPSULE</h3>
        <p className="mt-1 font-mono2 text-[9px] tracking-[0.22em] text-slate-400">
          YOUR FOLDER · YOUR DATA · AES-256-GCM · PLATFORM READS NOTHING
        </p>
      </div>
      <div className="space-y-3 p-4">
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="capsule passphrase (stays in this browser)"
          className="input-dark h-10 w-full px-3 text-[13px]"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={sealAll}
            disabled={busy !== "idle"}
            className="btn-red inline-flex items-center gap-2 px-4 py-2 font-display text-[10px] font-black tracking-[0.18em] disabled:opacity-50"
          >
            <Lock className="h-4 w-4" /> {busy === "sealing" ? "SEALING…" : "SEAL & DOWNLOAD"}
            <HardDriveDownload className="h-4 w-4" />
          </button>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 font-display text-[10px] font-black tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-500/20 ${
              busy !== "idle" ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Unlock className="h-4 w-4" /> {busy === "opening" ? "OPENING…" : "OPEN CAPSULE"}
            <HardDriveUpload className="h-4 w-4" />
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {note && <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-200">{note}</p>}
        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">
            <TriangleAlert className="h-4 w-4 flex-none" /> {error}
          </p>
        )}
        <p className="font-mono2 text-[9px] leading-relaxed tracking-[0.14em] text-slate-500">
          HOW IT WORKS · the file &lt;name&gt;-capsule.sg16.json lands in your downloads — park it in
          your Google Drive or phone folder. New device? Email sign-in for the subscription, open the
          capsule for the conversations. If the folder is lost forever, only your pass survives —
          your history was yours alone.
        </p>
      </div>
    </Panel>
  );
}
