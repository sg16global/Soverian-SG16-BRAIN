// Key validation against Workers KV. One code path for every consumer,
// including the owner (user #1). The presented key is hashed; KV stores
// hash -> record. A miss and a revoked key are the same 401 to callers.

import type { KeyRecord, Policy, AskRequest } from "./types.ts";
import { DEFAULT_POLICY } from "./types.ts";
import { bearer, keyHash, isKeyShape } from "./keys.ts";
import { verifyProjectKey, projectKeyRecord, isProjectKeyRevoked } from "./design-compat.ts";

export interface KeyStore {
  get(key: string): Promise<string | null>;
}

export type AuthResult =
  | { ok: true; record: KeyRecord }
  | { ok: false };

export async function authenticate(
  authorization: string | null,
  store: KeyStore,
  projectSecret?: string,
  revokedProjects: string[] = [],
): Promise<AuthResult> {
  const key = bearer(authorization);
  if (key && isKeyShape(key)) {
    // the KV path: only the SHA-256 of a key is ever stored
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
  // the old host's stateless sg16p_ project keys (same secret => old keys keep working)
  const match = /^Bearer\s+(sg16p_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec((authorization ?? "").trim());
  if (match) {
    const project = await verifyProjectKey(match[1], projectSecret, revokedProjects);
    if (!project) return { ok: false };
    // per-key revocation: a minted key with a revoked record dies here; a key
    // with no record is not managed by the record system and keeps working
    if (await isProjectKeyRevoked(store, match[1])) return { ok: false };
    return { ok: true, record: projectKeyRecord(match[1], project.project, project.issuedAt) };
  }
  return { ok: false };
}

/** A project's stored policy over the given defaults (the Worker passes its
 * env-configured queue wait as the default max_queue_ms). */
export async function loadPolicy(store: KeyStore, project: string, defaults: Policy = DEFAULT_POLICY): Promise<Policy> {
  const raw = await store.get(`policy:${project}`);
  if (!raw) return defaults;
  try {
    const p = JSON.parse(raw) as Partial<Policy>;
    return {
      rpm: typeof p.rpm === "number" && p.rpm > 0 ? Math.floor(p.rpm) : defaults.rpm,
      max_queue_ms: typeof p.max_queue_ms === "number" && p.max_queue_ms >= 0 ? p.max_queue_ms : defaults.max_queue_ms,
      require_json: typeof p.require_json === "boolean" ? p.require_json : defaults.require_json,
      blocked_patterns: Array.isArray(p.blocked_patterns) ? p.blocked_patterns.filter((x) => typeof x === "string") : defaults.blocked_patterns,
    };
  } catch {
    return defaults;
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
