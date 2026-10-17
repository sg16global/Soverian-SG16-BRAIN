// Key validation against Workers KV. One code path for every consumer,
// including the owner (user #1). The presented key is hashed; KV stores
// hash -> record. A miss and a revoked key are the same 401 to callers.

import type { KeyRecord, Policy, AskRequest } from "./types.ts";
import { DEFAULT_POLICY } from "./types.ts";
import { bearer, keyHash, isKeyShape } from "./keys.ts";

export interface KeyStore {
  get(key: string): Promise<string | null>;
}

export type AuthResult =
  | { ok: true; record: KeyRecord }
  | { ok: false };

export async function authenticate(
  authorization: string | null,
  store: KeyStore,
): Promise<AuthResult> {
  const key = bearer(authorization);
  if (!key || !isKeyShape(key)) return { ok: false };
  const raw = await store.get(await keyHash(key));
  if (!raw) return { ok: false };
  let record: KeyRecord;
  try {
    record = JSON.parse(raw) as KeyRecord;
  } catch {
    return { ok: false };
  }
  if (!record || record.revoked || typeof record.user !== "number") return { ok: false };
  return { ok: true, record };
}

export async function loadPolicy(store: KeyStore, project: string): Promise<Policy> {
  const raw = await store.get(`policy:${project}`);
  if (!raw) return DEFAULT_POLICY;
  try {
    const p = JSON.parse(raw) as Partial<Policy>;
    return {
      rpm: typeof p.rpm === "number" && p.rpm > 0 ? Math.floor(p.rpm) : DEFAULT_POLICY.rpm,
      max_queue_ms: typeof p.max_queue_ms === "number" && p.max_queue_ms >= 0 ? p.max_queue_ms : DEFAULT_POLICY.max_queue_ms,
      require_json: typeof p.require_json === "boolean" ? p.require_json : DEFAULT_POLICY.require_json,
      blocked_patterns: Array.isArray(p.blocked_patterns) ? p.blocked_patterns.filter((x) => typeof x === "string") : DEFAULT_POLICY.blocked_patterns,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

export function parseAsk(body: unknown): AskRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const kind = b.kind === "compute" || b.kind === "state" ? b.kind : "chat";
  const text = typeof b.text === "string" ? b.text : "";
  if (kind !== "chat" && typeof b.op !== "string") return null; // compute/state need an op
  if (kind === "chat" && (!text || text.length > 65536)) return null;
  return { kind, text: kind === "chat" ? text : String(b.op ?? "") } as AskRequest;
}
