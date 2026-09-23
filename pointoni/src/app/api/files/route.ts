import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { db } from "@/db";
import { storedFiles } from "@/db/schema";
import { desc, and, eq } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveAccount } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to view stored files." }, { status: 401 });
  const files = await db.select({
    id: storedFiles.id,
    name: storedFiles.name,
    mime: storedFiles.mime,
    sizeBytes: storedFiles.sizeBytes,
    createdAt: storedFiles.createdAt,
  }).from(storedFiles)
    .where(eq(storedFiles.userId, account.user.id)).orderBy(desc(storedFiles.createdAt));
  return NextResponse.json({ files, storage: "server filesystem; deployment backups and retention depend on configuration" });
}

export async function POST(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "File exceeds the 10 MB pilot limit." }, { status: 413 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File exceeds the 10 MB pilot limit." }, { status: 413 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u00C0-\u017F ]/g, "_").slice(0, 180) || "upload.bin";
  const storageKey = `${account.user.id}-${randomUUID()}-${hash}-${safeName}`;
  const filePath = path.join(UPLOAD_DIR, storageKey);
  await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  try {
    const [created] = await db.insert(storedFiles).values({
      userId: account.user.id,
      name: safeName,
      storageKey,
      mime: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }).returning({
      id: storedFiles.id,
      name: storedFiles.name,
      mime: storedFiles.mime,
      sizeBytes: storedFiles.sizeBytes,
      createdAt: storedFiles.createdAt,
    });
    return NextResponse.json({ file: created, stored: true });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to delete stored files." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const rows = await db.select({ id: storedFiles.id, storageKey: storedFiles.storageKey })
    .from(storedFiles)
    .where(and(eq(storedFiles.id, id), eq(storedFiles.userId, account.user.id)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ ok: true, deleted: false });
  await db.delete(storedFiles).where(and(eq(storedFiles.id, id), eq(storedFiles.userId, account.user.id)));
  const storageKey = rows[0].storageKey;
  if (storageKey && path.basename(storageKey) === storageKey && storageKey.startsWith(`${account.user.id}-`)) {
    await unlink(path.join(UPLOAD_DIR, storageKey)).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, deleted: true });
}
