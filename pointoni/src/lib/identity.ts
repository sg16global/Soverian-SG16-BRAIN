// ===================================================================
// Sovereign email identity and process-local fair-use accounting.
//
// Identity verification and chat persistence are separate concerns: a bearer
// token proves a verified email, while account-owned chat rows are served only
// after their userId is matched. Rate windows in this module are per process;
// deploy multiple instances behind a shared limiter for distributed limits.
// ===================================================================

import crypto from "node:crypto";
import { db } from "@/db";
import { apiTokens, authCodes, sovereignIdentities, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { PASSES, type PassId } from "@/lib/billing";

const CODE_TTL_MS = 10 * 60_000;
const TOKEN_TTL_MS = 30 * 24 * 3600_000;
const CODE_RATE_PER_EMAIL_PER_HOUR = 3;
const CODE_RATE_PER_NETWORK_PER_HOUR = 10;
const VERIFY_ATTEMPTS_PER_EMAIL_NETWORK = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const configuredSecret = process.env.SG16_IDENTITY_SECRET;
if (configuredSecret && Buffer.byteLength(configuredSecret, "utf8") < 32) {
  throw new Error("SG16_IDENTITY_SECRET must contain at least 32 UTF-8 bytes");
}
const SECRET: Buffer | null = configuredSecret
  ? Buffer.from(configuredSecret, "utf8")
  : process.env.NODE_ENV === "production"
    ? null
    : crypto.randomBytes(32);

const b64u = (buf: Buffer) => buf.toString("base64url");

type WindowCounter = { count: number; resetAt: number };
const codeRequests = new Map<string, WindowCounter>();
const verificationAttempts = new Map<string, WindowCounter>();

function consumeWindow(
  table: Map<string, WindowCounter>,
  key: string,
  limit: number,
  durationMs: number,
): boolean {
  const now = Date.now();
  const current = table.get(key);
  if (!current || current.resetAt <= now) {
    table.set(key, { count: 1, resetAt: now + durationMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function pruneWindows(table: Map<string, WindowCounter>): void {
  if (table.size < 2048) return;
  const now = Date.now();
  for (const [key, value] of table) {
    if (value.resetAt <= now) table.delete(key);
  }
}

function stableKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export type SovereignTokenPayload = {
  email: string;
  exp: number; // ms epoch
  v: 1;
};

export function signToken(emailRaw: string): string {
  if (!SECRET) throw new Error("Sign-in is unavailable until SG16_IDENTITY_SECRET is configured.");
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Cannot issue a token for an invalid email.");
  const payload: SovereignTokenPayload = { email, exp: Date.now() + TOKEN_TTL_MS, v: 1 };
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(tokenRaw: string): SovereignTokenPayload | null {
  if (!SECRET || typeof tokenRaw !== "string" || tokenRaw.length > 4096) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(tokenRaw.trim());
  if (!match) return null;
  const [, body, signature] = match;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SovereignTokenPayload>;
    if (
      payload.v !== 1 ||
      typeof payload.email !== "string" ||
      !EMAIL_PATTERN.test(payload.email) ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Date.now()
    ) return null;
    return { email: payload.email.toLowerCase(), exp: payload.exp, v: 1 };
  } catch {
    return null;
  }
}

const codeHash = (email: string, code: string) => {
  if (!SECRET) throw new Error("Email sign-in is unavailable on this deployment.");
  return crypto.createHmac("sha256", SECRET)
    .update(`sg16-email-code-v1|${email.toLowerCase()}|${code}`)
    .digest("hex");
};

export type IdentityRow = typeof sovereignIdentities.$inferSelect;

export async function requestMagicCode(
  emailRaw: string,
  networkKey = "unknown-network",
): Promise<{ devCode?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  if (!SECRET) throw new Error("Email sign-in is unavailable until SG16_IDENTITY_SECRET is configured.");

  const mailerUrl = process.env.MAILER_URL?.trim();
  if (process.env.NODE_ENV === "production" && !mailerUrl) {
    throw new Error("Email delivery is not configured; sign-in codes cannot be sent.");
  }

  pruneWindows(codeRequests);
  const emailKey = stableKey(email);
  const netKey = stableKey(networkKey || "unknown-network");
  if (!consumeWindow(codeRequests, `email:${emailKey}`, CODE_RATE_PER_EMAIL_PER_HOUR, 3600_000)) {
    throw new Error("Too many codes requested for this email. Try again within the hour.");
  }
  if (!consumeWindow(codeRequests, `network:${netKey}`, CODE_RATE_PER_NETWORK_PER_HOUR, 3600_000)) {
    throw new Error("Too many sign-in requests from this network. Try again later.");
  }

  // Also consult recent rows. The process-local limits above remain effective
  // when older codes are replaced or the database is shared across instances.
  const previous = await db.select().from(authCodes).where(eq(authCodes.email, email));
  const hourAgo = Date.now() - 3600_000;
  if (previous.filter((row) => row.createdAt.getTime() > hourAgo).length >= CODE_RATE_PER_EMAIL_PER_HOUR) {
    throw new Error("Too many codes requested for this email. Try again within the hour.");
  }

  await db.delete(authCodes).where(eq(authCodes.email, email));
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(authCodes).values({
    email,
    codeHash: codeHash(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  await ensureIdentity(email);

  if (mailerUrl) {
    let parsed: URL;
    try {
      parsed = new URL(mailerUrl);
    } catch {
      throw new Error("MAILER_URL is invalid.");
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("MAILER_URL must use HTTPS (localhost is allowed for development).");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(parsed, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Email delivery failed. Try again later.");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Email delivery failed")) throw error;
      throw new Error("Email delivery is temporarily unavailable.");
    } finally {
      clearTimeout(timeout);
    }
    return {};
  }

  // Codes are returned only in explicit non-production local development.
  return process.env.NODE_ENV === "production" ? {} : { devCode: code };
}

export async function verifyMagicCode(
  emailRaw: string,
  codeRaw: string,
  networkKey = "unknown-network",
): Promise<{ token: string; identity: IdentityRow }> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.trim();
  if (!SECRET) throw new Error("Email sign-in is unavailable until SG16_IDENTITY_SECRET is configured.");
  if (!EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(code)) {
    throw new Error("That code is wrong or expired — request a fresh one.");
  }

  pruneWindows(verificationAttempts);
  const attemptKey = stableKey(`${email}|${networkKey || "unknown-network"}`);
  if (!consumeWindow(verificationAttempts, attemptKey, VERIFY_ATTEMPTS_PER_EMAIL_NETWORK, 10 * 60_000)) {
    throw new Error("Too many attempts. Request a fresh code and try again later.");
  }

  const rows = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.email, email), eq(authCodes.codeHash, codeHash(email, code))))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() <= Date.now()) {
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
  const inserted = await db
    .insert(sovereignIdentities)
    .values({ email })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const raced = await db
    .select()
    .from(sovereignIdentities)
    .where(eq(sovereignIdentities.email, email))
    .limit(1);
  if (!raced[0]) throw new Error("Unable to create identity record.");
  return raced[0];
}

export async function bindVerifiedPlan(
  emailRaw: string,
  pass: PassId,
  billingToken: string,
  expiryEpochSeconds: number,
): Promise<IdentityRow> {
  const spec = PASSES.find((item) => item.id === pass);
  if (!spec) throw new Error("Unknown pass.");
  if (!/^[a-f0-9]{64}$/.test(billingToken)) throw new Error("Host pass token is invalid.");
  if (!Number.isSafeInteger(expiryEpochSeconds) || expiryEpochSeconds * 1000 <= Date.now()) {
    throw new Error("Host pass has expired or has an invalid expiry.");
  }
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Identity email is invalid.");
  const identity = await ensureIdentity(email);
  const rows = await db
    .update(sovereignIdentities)
    .set({
      plan: spec.label,
      planToken: billingToken,
      planExpiresAt: new Date(expiryEpochSeconds * 1000),
    })
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
// Process-local sliding windows. These reset on process restart and are not a
// distributed quota system. Use a shared store for production multi-instance
// rate enforcement.
// -------------------------------------------------------------------
export const FREE_BUCKET = 20;
export const WORK_BUCKET = 500;
const buckets = new Map<string, WindowCounter>();

export function consumeBucket(
  key: string,
  limit: number,
): { ok: boolean; remaining: number; resetAt: number } {
  pruneWindows(buckets);
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + 3600_000;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
  }
  if (existing.count >= limit) return { ok: false, remaining: 0, resetAt: existing.resetAt };
  existing.count += 1;
  return { ok: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

export type ChatTier = "free" | "work";

export async function resolveTier(req: Request): Promise<{
  tier: ChatTier;
  email: string | null;
  bucketKey: string;
  limit: number;
}> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (match && match[1].length <= 512) {
    const token = match[1];
    let email: string | null = null;
    const payload = verifyToken(token);
    if (payload) {
      email = payload.email;
    } else if (/^sg16_[a-f0-9]{48}$/.test(token)) {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const tokenRows = await db
        .select({ userId: apiTokens.userId })
        .from(apiTokens)
        .where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.revoked, false)))
        .limit(1);
      if (tokenRows[0]) {
        const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, tokenRows[0].userId)).limit(1);
        email = userRows[0]?.email ?? null;
      }
    }
    if (email) {
      const identity = await getIdentity(email);
      if (planActive(identity)) {
        return { tier: "work", email, bucketKey: `work:${email}`, limit: WORK_BUCKET };
      }
    }
  }

  // Behind a trusted reverse proxy, configure it to overwrite these headers;
  // the framework's generic Request API exposes no reliable socket peer IP.
  const rawIp =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anon";
  const ipKey = crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 16);
  return { tier: "free", email: null, bucketKey: `free:${ipKey}`, limit: FREE_BUCKET };
}
