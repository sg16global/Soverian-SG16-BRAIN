// ===================================================================
// SOVEREIGN IDENTITY — email-only sign-in, zero-profile by design.
//
//  • Identity = one email column. No passwords, no names, no telemetry.
//  • Magic code: 6 digits, SHA-256 hashed at rest, 10-minute TTL.
//  • Session: HMAC-signed sovereign token (30 days) — survives on the
//    USER'S device (localStorage / their capsule), never snooped here.
//  • Fair use: free guests share a small hourly bucket per IP so one
//    person can never drain the daily energy; subscribers get a wide
//    personal bucket + work mode automatically.
// ===================================================================

import crypto from "node:crypto";
import { db } from "@/db";
import { authCodes, sovereignIdentities } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { PASSES, type PassId } from "@/lib/billing";

const CODE_TTL_MS = 10 * 60_000;
const TOKEN_TTL_MS = 30 * 24 * 3600_000;
const CODE_RATE_PER_EMAIL_PER_HOUR = 3;

// signing secret: set SG16_IDENTITY_SECRET in production for restart-stable
// tokens; in sovereign-local dev a boot secret is derived (memory is the
// source of truth anyway — nothing to leak).
const SECRET: Buffer = process.env.SG16_IDENTITY_SECRET
  ? Buffer.from(process.env.SG16_IDENTITY_SECRET, "utf8")
  : crypto.randomBytes(32);

const b64u = (buf: Buffer) => buf.toString("base64url");

export type SovereignTokenPayload = {
  email: string;
  exp: number; // ms epoch
  v: 1;
};

export function signToken(email: string): string {
  const payload: SovereignTokenPayload = { email: email.toLowerCase(), exp: Date.now() + TOKEN_TTL_MS, v: 1 };
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string): SovereignTokenPayload | null {
  const m = /^([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)$/.exec(token.trim());
  if (!m) return null;
  const [, body, sig] = m;
  const expect = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SovereignTokenPayload;
    if (!p.email || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

const codeHash = (email: string, code: string) =>
  crypto.createHash("sha256").update(`${code}:${email.toLowerCase()}`).digest("hex");

export type IdentityRow = typeof sovereignIdentities.$inferSelect;

export async function requestMagicCode(emailRaw: string): Promise<{ devCode?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Enter a valid email address.");

  // fair-send throttle
  const recent = await db.select().from(authCodes).where(eq(authCodes.email, email));
  const hourAgo = Date.now() - 3600_000;
  const recentCount = recent.filter((c) => c.createdAt.getTime() > hourAgo).length;
  if (recentCount >= CODE_RATE_PER_EMAIL_PER_HOUR) {
    throw new Error("Too many codes requested. Try again within the hour.");
  }

  // replace previous codes for this email
  await db.delete(authCodes).where(eq(authCodes.email, email));

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(authCodes).values({
    email,
    codeHash: codeHash(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  await ensureIdentity(email);

  // delivery: production would send via SMTP/SES (env MAILER). With no mailer
  // configured the code is echoed back for the sovereign-local dev loop —
  // flagged clearly so nobody mistakes the fallback for production behavior.
  const devCode = process.env.MAILER_URL ? undefined : code;
  if (process.env.MAILER_URL) {
    void fetch(process.env.MAILER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    }).catch(() => undefined);
  }
  return { devCode };
}

export async function verifyMagicCode(
  emailRaw: string,
  codeRaw: string,
): Promise<{ token: string; identity: IdentityRow }> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.trim();
  const rows = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.email, email), eq(authCodes.codeHash, codeHash(email, code))))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new Error("That code is wrong or expired — request a fresh one.");
  }
  await db.delete(authCodes).where(eq(authCodes.id, row.id));

  const identity = await ensureIdentity(email);
  await db
    .update(sovereignIdentities)
    .set({ lastLoginAt: new Date() })
    .where(eq(sovereignIdentities.id, identity.id));
  return { token: signToken(email), identity };
}

async function ensureIdentity(email: string): Promise<IdentityRow> {
  const rows = await db
    .select()
    .from(sovereignIdentities)
    .where(eq(sovereignIdentities.email, email))
    .limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(sovereignIdentities).values({ email }).returning();
  return inserted[0];
}

export async function bindPlan(
  emailRaw: string,
  pass: PassId,
  billingToken: string,
): Promise<IdentityRow> {
  const spec = PASSES.find((p) => p.id === pass);
  if (!spec) throw new Error("Unknown pass.");
  const email = emailRaw.trim().toLowerCase();
  const identity = await ensureIdentity(email);
  const expiresAt = new Date(Date.now() + spec.hours * 3600_000);
  const rows = await db
    .update(sovereignIdentities)
    .set({ plan: spec.label, planToken: billingToken.slice(0, 200), planExpiresAt: expiresAt })
    .where(eq(sovereignIdentities.id, identity.id))
    .returning();
  return rows[0];
}

export async function getIdentity(emailRaw: string): Promise<IdentityRow | null> {
  const rows = await db
    .select()
    .from(sovereignIdentities)
    .where(eq(sovereignIdentities.email, emailRaw.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export function planActive(identity: IdentityRow | null): boolean {
  return !!identity?.planExpiresAt && identity.planExpiresAt.getTime() > Date.now();
}

// -------------------------------------------------------------------
// fair-use buckets — in-memory sliding windows, per process.
// free guests: hourly half-gram of energy; subscribers: a full plate.
// -------------------------------------------------------------------
export const FREE_BUCKET = 20;
export const WORK_BUCKET = 500;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeBucket(
  key: string,
  limit: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 3600_000 });
    return { ok: true, remaining: limit - 1, resetAt: now + 3600_000 };
  }
  if (b.count >= limit) return { ok: false, remaining: 0, resetAt: b.resetAt };
  b.count += 1;
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt };
}

export type ChatTier = "free" | "work";

export async function resolveTier(req: Request): Promise<{
  tier: ChatTier;
  email: string | null;
  bucketKey: string;
  limit: number;
}> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) {
    const payload = verifyToken(m[1]);
    if (payload) {
      const identity = await getIdentity(payload.email);
      if (planActive(identity)) {
        return { tier: "work", email: payload.email, bucketKey: `work:${payload.email}`, limit: WORK_BUCKET };
      }
    }
  }
  const rawIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (req as unknown as { ip?: string }).ip ||
    "anon";
  const ipKey = crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 16);
  return { tier: "free", email: null, bucketKey: `free:${ipKey}`, limit: FREE_BUCKET };
}
