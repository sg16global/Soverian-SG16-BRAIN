import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storedFiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile, readdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._\-\u00C0-\u017F ]/g, "_");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
  const file = rows[0];
  if (!file) return new NextResponse("Not found", { status: 404 });

  const dir = path.join(process.cwd(), "data", "uploads");
  const suffix = `-${safeFileName(file.name)}`;
  const entries = await readdir(dir).catch(() => [] as string[]);
  const match = entries.find((e) => e.endsWith(suffix));
  if (!match) return new NextResponse("File payload missing", { status: 410 });

  const data = await readFile(path.join(dir, match)).catch(() => null);
  if (!data) return new NextResponse("File payload missing", { status: 410 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
