"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, Download, Trash2, FolderLock } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";

type FileRow = {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/files", { cache: "no-store" });
    if (res.ok) setFiles((await res.json()).files ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} exceeds the 10MB pilot limit.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        if (!res.ok) setError(`Upload failed: ${file.name}`);
      }
      await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this file from your vault?")) return;
    await fetch(`/api/files?id=${id}`, { method: "DELETE" });
    setFiles((p) => (p ?? []).filter((f) => f.id !== id));
  }

  return (
    <SiteChrome>
      <PageHeader title="MY FILES" subtitle="Encrypted sovereign file vault. Uploads are stored on your deployment — they never train a third-party model.">
        <button onClick={() => inputRef.current?.click()} className="btn-red inline-flex items-center gap-2 px-4 py-2 text-[11px]">
          <UploadCloud className="h-4 w-4" /> UPLOAD
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </PageHeader>

      <div className="mx-auto max-w-[900px] px-4 py-8">
        <Panel
          className={`corner flex flex-col items-center gap-3 border-dashed p-8 text-center transition ${
            dragOver ? "border-cyan-400/80 bg-cyan-500/10" : ""
          }`}
          corners={false}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
            <UploadCloud className="h-7 w-7 text-cyan-300" />
          </span>
          <p className="font-display text-sm font-bold tracking-widest text-white">
            {uploading ? "SECURELY UPLOADING…" : "DRAG FILES HERE OR USE THE UPLOAD BUTTON"}
          </p>
          <p className="font-mono2 text-[10px] tracking-widest text-slate-500">10MB PER FILE · STORED INSIDE THE SOVEREIGN PERIMETER</p>
          <input
            type="file"
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              upload(e.dataTransfer.files);
            }}
            onChange={(e) => upload(e.target.files)}
          />
        </Panel>

        {error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        <div className="mt-6">
          {files === null ? (
            <Panel className="p-10 text-center text-sm tracking-widest text-slate-500 pulse-soft">SCANNING VAULT…</Panel>
          ) : files.length === 0 ? (
            <Panel className="corner flex flex-col items-center gap-3 p-12 text-center">
              <FolderLock className="h-10 w-10 text-slate-600" />
              <h2 className="font-display text-base font-black tracking-wide text-white">VAULT EMPTY</h2>
              <p className="max-w-sm text-sm text-slate-400">No files stored yet. Upload documents, code or data to reference them in sovereign conversations.</p>
            </Panel>
          ) : (
            <ul className="space-y-2.5">
              {files.map((f) => (
                <li key={f.id}>
                  <Panel soft corners={false} className="flex items-center gap-4 px-4 py-3">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-cyan-400/30 bg-cyan-500/10">
                      <FileText className="h-5 w-5 text-cyan-300" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-slate-100">{f.name}</p>
                      <p className="font-mono2 text-[9px] tracking-widest text-slate-500">
                        {f.mime || "unknown"} · {fmtSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={`/api/files/${f.id}`}
                      className="btn-ghost grid h-9 w-9 place-items-center"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => remove(f.id)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/30 text-red-400 transition hover:bg-red-500/20"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SiteChrome>
  );
}
