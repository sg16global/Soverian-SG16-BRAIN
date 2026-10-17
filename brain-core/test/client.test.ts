// Client-route tests: pass resolution, refusal mapping, charter content.
// The ingest chat pipeline itself is covered by router.test.ts (same
// code path as /v1/ask with a pass-derived key record).

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";

import { INVARIANTS, resolvePass, passKeyRecord, refuseStage, clientRoute } from "../src/client-routes.ts";

const SECRET = "test-billing-secret-0123456789";
const stubDb = {
  prepare: () => ({ bind: () => ({ first: async () => null }) }),
} as never;

function signedRecordB64() {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 24 * 3600;
  const nonce = randomBytes(18).toString("base64url");
  const token = createHmac("sha256", SECRET).update(`sg16-pass-v1|day||3|${expires}|${nonce}`).digest("hex");
  const record = { pass: "day", label: "24-Hour Entry", provider: "dodo", region: null, list_price: 3,
    price_charged: 3, humanitarian_bypass: false, activated_at: now, expires_at: expires, nonce, token, verified_by: "sg16-host" };
  return Buffer.from(JSON.stringify(record)).toString("base64url");
}

test("resolvePass accepts a signed record, rejects garbage and absence", async () => {
  const env = { LOGS: stubDb, BILLING_SECRET: SECRET } as never;
  const ok = await resolvePass(signedRecordB64(), env);
  assert.ok(ok, "signed record must resolve");
  assert.equal(typeof ok.pass, "string");
  assert.ok(ok.activatedAt > 0);

  assert.equal(await resolvePass(null, env), null);
  assert.equal(await resolvePass("garbage-not-a-record", env), null);
  assert.equal(await resolvePass("f".repeat(64), env), null); // legacy token not in the passes table
});

test("passKeyRecord derives a stable matrix key id from the pass", async () => {
  const record = await passKeyRecord("sg16-pass-value", 1_800_000_000);
  assert.equal(record.project, "web");
  assert.equal(record.user, 0);
  assert.match(record.id, /^pass_[0-9a-f]{12}$/);
  const again = await passKeyRecord("sg16-pass-value", 1_800_000_000);
  assert.equal(again.id, record.id);
  const other = await passKeyRecord("other", 1_800_000_000);
  assert.notEqual(other.id, record.id);
});

test("refuseStage maps known machine codes, keeps unknown ones honest", () => {
  assert.match(refuseStage("E_RATE_LIMIT"), /rate limit/i);
  assert.match(refuseStage("E_UNVERIFIED"), /verification/i);
  assert.equal(refuseStage("E_NO_SUCH_CODE"), "refused: E_NO_SUCH_CODE");
});

test("the charter keeps the eight published invariants", () => {
  assert.equal(INVARIANTS.length, 8);
  const keys = INVARIANTS.map((i) => i.key);
  assert.deepEqual(keys, [
    "independence", "patience", "idea_ingest", "escalation",
    "anti_harm", "zero_hallucination", "language_parity", "model_neutrality",
  ]);
  for (const inv of INVARIANTS) {
    assert.ok(inv.text.length > 40, `${inv.key} text must carry substance`);
  }
});

test("GET /api/health includes the fields the design's admin console renders", async () => {
  const env = { LOGS: stubDb, MODEL_NAME: "devstral", MISTRAL_MODEL: "mistral-small-latest" } as never;
  const probe = async () => ({ d1: true, model: true });
  const res = await clientRoute(new Request("https://mistralbrain.com/api/health"), env, "/api/health", probe);
  assert.ok(res);
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  // pre-existing shape (panel consumers)
  assert.equal(body.ok, true);
  assert.equal(body.database, true);
  assert.equal(body.brain, "online");
  assert.equal(typeof body.gate_weights_sha256, "string");
  // admin console fields — the pointoni admin page reads these without guards
  assert.ok(Array.isArray(body.engines) && (body.engines as string[]).length > 0, "engines must be a non-empty array");
  assert.equal(typeof body.persistence, "string");
  assert.equal(typeof body.answering, "string");
  const heart = body.heart as { status: string; model?: string };
  assert.equal(heart.status, "online");
  assert.equal(heart.model, "devstral");
  assert.equal(body.lastAnswered, null);
});
