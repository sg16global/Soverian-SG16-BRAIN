// Shared types for the brain core. Language-neutral by construction:
// human language exists only at the model layer; the core speaks in
// machine codes and structures.

export interface KeyRecord {
  id: string;          // internal id, e.g. "k_01"
  user: number;        // owner = 1; every consumer, including the owner, uses keys
  project: string;     // "platform" for the owner/first party
  created: number;     // unix ms
  revoked: boolean;
}

export interface Policy {
  rpm: number;                 // requests per minute
  max_queue_ms: number;        // how long a request may wait for the model slot
  require_json: boolean;       // answers must be a JSON object {answer: ...}
  blocked_patterns: string[];  // regexes (operator-configured, per project)
}

export const DEFAULT_POLICY: Policy = {
  rpm: 60,
  max_queue_ms: 45000,
  require_json: false,
  blocked_patterns: [],
};

export interface AskRequest {
  kind: "chat" | "compute" | "state";
  text: string;
}

export interface AskMeta {
  engine: "model-vps" | "core";
  model: string;       // which self-hosted model answered (chat brain or coder)
  checked: boolean;    // the self-check pass ran on this answer
  queue_ms: number;
  latency_ms: number;
  verified: boolean;
  script: string | null;
}

export interface ErrorBody {
  ok: false;
  code: string; // machine code, e.g. E_RATE_LIMIT — never a human-language sentence
}

export const ERR = {
  E_BAD_REQUEST: 400,
  E_UNAUTHORIZED: 401,
  E_FORBIDDEN: 403,
  E_NOT_FOUND: 404,
  E_RATE_LIMIT: 429,
  E_BUSY: 503,
  E_UPSTREAM: 502,
  E_UNVERIFIED: 502,
  E_INTERNAL: 500,
} as const;
