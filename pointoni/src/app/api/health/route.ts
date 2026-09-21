import { db, persistenceMode } from "@/db";
import { sql } from "drizzle-orm";
import { brainHealth } from "@/lib/brain-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  let brain: "online" | "offline" = "offline";
  try {
    await brainHealth();
    brain = "online";
  } catch {
    brain = "offline";
  }

  return Response.json(
    { ok: database, database, brain, persistence: persistenceMode },
    { status: database ? 200 : 500 },
  );
}
