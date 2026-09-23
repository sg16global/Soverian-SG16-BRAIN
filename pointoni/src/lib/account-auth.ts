import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { getIdentity, planActive, verifyToken, type IdentityRow } from "@/lib/identity";
import { ensureSeeded } from "@/lib/seed";

export type AccountContext = {
  user: typeof users.$inferSelect;
  identity: IdentityRow | null;
  authKind: "identity" | "api-token";
};

/** Resolve a verified sovereign identity token or a non-revoked account API token. */
export async function resolveAccount(req: Request): Promise<AccountContext | null> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > 512) return null;
  const token = match[1];

  const signedIdentity = verifyToken(token);
  if (signedIdentity) {
    const identity = await getIdentity(signedIdentity.email);
    if (!identity) return null;
    const user = await ensureIdentityUser(identity.email);
    return { user, identity, authKind: "identity" };
  }

  if (!/^sg16_[a-f0-9]{48}$/.test(token)) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.revoked, false)))
    .limit(1);
  const apiToken = rows[0];
  if (!apiToken) return null;

  const accountRows = await db.select().from(users).where(eq(users.id, apiToken.userId)).limit(1);
  const user = accountRows[0];
  if (!user) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, apiToken.id));
  const identity = await getIdentity(user.email);
  return { user, identity, authKind: "api-token" };
}

/** Stable chat/user row for a verified email; never uses the shared demo user. */
async function ensureIdentityUser(emailRaw: string) {
  await ensureSeeded();
  const email = emailRaw.trim().toLowerCase();
  const handle = `identity-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  const existing = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(users)
    .values({
      handle,
      displayName: "Sovereign user",
      email,
      role: "member",
      preferences: { defaultModel: "sg16-brain", notifications: true },
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const raced = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!raced[0]) throw new Error("Unable to resolve account record.");
  return raced[0];
}

export function accountPlanIsActive(account: AccountContext | null): boolean {
  return planActive(account?.identity ?? null);
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Sign in with a verified email to access this account data." }, { status: 401 });
}
