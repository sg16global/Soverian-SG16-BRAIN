// Design-compat tests: the legacy design-API surface the pointoni pages speak.
// Covers: operator token round-trip, the old scrypt password hash, the old
// sg16p_ project-key scheme (old-host keys must keep verifying), the chat
// adapter's ChatReply/stream shapes, and the admin console guard.

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";

import {
  signIdentityToken,
  verifyIdentityToken,
  verifyPasswordScrypt,
  adminLogin,
  createProjectKey,
  verifyProjectKey,
  designCompatRoute,
  type DesignEnv,
} from "../src/design-compat.ts";
import { authenticate } from "../src/auth.ts";

const IDENTITY_SECRET = "identity-secret-0123456789-identity-secret";
const PROJECT_SECRET = "project-key-secret-0123456789abcdef";
const BILLING_SECRET = "test-billing-secret-0123456789";
const ADMIN_HASH = (() => {
  // same format the old host stored: scrypt:N:r:p:salt_b64u:hash_b64u
  const salt = randomBytes(16);
  const hash = scryptSync("operator-password-123", salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", 32768, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join(":");
})();

function env(overrides: Partial<DesignEnv> = {}): DesignEnv {
  return {
    KEYS: {} as never,
    LOGS: {} as never,
    QUEUE: {} as never,
    MATRIX: {} as never,
    SG16_IDENTITY_SECRET: IDENTITY_SECRET,
    SG16_ADMIN_EMAILS: "sg16global@gmail.com",
    SG16_ADMIN_PASSWORD_HASH: ADMIN_HASH,
    SG16_PROJECT_KEY_SECRET: PROJECT_SECRET,
    BILLING_SECRET,
    ...overrides,
  } as DesignEnv;
}

const deps = (e: DesignEnv, chatDoor?: unknown, model = true) => ({
  env: e,
  chatDoor: (chatDoor as never) ?? (async () => Response.json({ ok: true, answer: "hello", meta: { engine: "model-vps", latency_ms: 7 } })),
  healthProbe: async () => ({ d1: true, model }),
});

// ---------------------------------------------------------------- identity

test("identity token round-trips and rejects tampering and expiry", async () => {
  const token = await signIdentityToken("Operator@Example.com", IDENTITY_SECRET);
  const payload = await verifyIdentityToken(token, IDENTITY_SECRET);
  assert.equal(payload?.email, "operator@example.com");
  assert.equal(await verifyIdentityToken(token, "wrong-secret"), null);
  assert.equal(await verifyIdentityToken(token + "x", IDENTITY_SECRET), null);
  // an expired token must fail
  const [body] = token.split(".");
  const raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { email: string; exp: number; v: number };
  raw.exp = Date.now() - 1000;
  const deadBody = Buffer.from(JSON.stringify(raw), "utf8").toString("base64url");
  const deadSig = createHmac("sha256", IDENTITY_SECRET).update(deadBody).digest("base64url");
  assert.equal(await verifyIdentityToken(`${deadBody}.${deadSig}`, IDENTITY_SECRET), null);
});

// ------------------------------------------------------------- password

test("scrypt verification accepts the old host hash and rejects wrong passwords", async () => {
  assert.equal(verifyPasswordScrypt("operator-password-123", ADMIN_HASH), true);
  assert.equal(verifyPasswordScrypt("wrong", ADMIN_HASH), false);
  assert.equal(verifyPasswordScrypt("x", "not-a-hash"), false);
});

test("adminLogin: right credentials pass, wrong ones 401, unconfigured 503", async () => {
  const ok = await adminLogin("sg16global@gmail.com", "operator-password-123", "1.2.3.4", env());
  assert.ok(ok.ok && (ok as { token: string }).token);

  const bad = await adminLogin("sg16global@gmail.com", "nope", "1.2.3.4", env());
  assert.equal(bad.ok, false);
  assert.equal((bad as { status: number }).status, 401);

  const unknown = await adminLogin("intruder@example.com", "operator-password-123", "1.2.3.4", env());
  assert.equal((unknown as { status: number }).status, 401);

  const off = await adminLogin("sg16global@gmail.com", "operator-password-123", "1.2.3.4", env({ SG16_ADMIN_PASSWORD_HASH: undefined }));
  assert.equal((off as { status: number }).status, 503);

  // guess throttling: five failures then 429
  for (let i = 0; i < 5; i++) {
    await adminLogin("sg16global@gmail.com", "nope", "9.9.9.9", env());
  }
  const throttled = await adminLogin("sg16global@gmail.com", "nope", "9.9.9.9", env());
  assert.equal((throttled as { status: number }).status, 429);
});

// ------------------------------------------------------------ project keys

test("project keys mint and verify; a key signed by the OLD host code also verifies", async () => {
  const key = await createProjectKey("my-project", PROJECT_SECRET);
  assert.ok(key.startsWith("sg16p_"));
  const verified = await verifyProjectKey(key, PROJECT_SECRET, []);
  assert.equal(verified?.project, "my-project");

  // reproduce the old host's signing exactly (pointoni/src/lib/project-keys.ts)
  const payload = Buffer.from(
    JSON.stringify({ v: 1, p: "legacy-app", iat: 1700000000, n: randomBytes(6).toString("base64url") }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", PROJECT_SECRET).update(`sg16-project-key-v1|${payload}`).digest("base64url");
  const legacyKey = `sg16p_${payload}.${sig}`;
  assert.equal((await verifyProjectKey(legacyKey, PROJECT_SECRET, []))?.project, "legacy-app");
  assert.equal(await verifyProjectKey(legacyKey, PROJECT_SECRET, ["legacy-app"]), null);
  assert.equal(await verifyProjectKey(legacyKey, "other-secret", []), null);
  assert.equal(await verifyProjectKey("sg16p_garbage", PROJECT_SECRET, []), null);
});

test("authenticate accepts sg16p_ project keys through the /v1 path and revocation blocks them", async () => {
  const key = await createProjectKey("other-project", PROJECT_SECRET);
  const store = { get: async () => null };
  const auth = await authenticate(`Bearer ${key}`, store, PROJECT_SECRET, []);
  assert.ok(auth.ok);
  assert.equal(auth.ok ? auth.record.project : "", "other-project");

  const revoked = await authenticate(`Bearer ${key}`, store, PROJECT_SECRET, ["other-project"]);
  assert.equal(revoked.ok, false);

  const kvKey = "sg16_" + "0".repeat(32);
  const kvAuth = await authenticate(
    `Bearer ${kvKey}`,
    { get: async () => JSON.stringify({ id: "k", user: 1, project: "p", created: 0, revoked: false }) },
    PROJECT_SECRET,
    [],
  );
  assert.ok(kvAuth.ok, "existing sg16_ KV keys must keep working");
});

// ------------------------------------------------------------------ routes

test("GET /api/brain probes: turnstile off, health honest", async () => {
  const e = env();
  const ts = await designCompatRoute(new Request("https://x/api/brain?probe=turnstile"), "/api/brain", deps(e));
  assert.deepEqual(await ts?.json(), { enabled: false, siteKey: null });

  const up = await designCompatRoute(new Request("https://x/api/brain?probe=health"), "/api/brain", deps(e));
  assert.equal(up?.status, 200);
  assert.equal((await up?.json()).brain, "online");

  const down = await designCompatRoute(new Request("https://x/api/brain?probe=health"), "/api/brain", deps(e, undefined, false));
  assert.equal(down?.status, 503);
});

test("operator sign-in via POST /api/identity, then me, then project-key minting", async () => {
  const e = env();
  const login = await designCompatRoute(
    new Request("https://x/api/identity", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "5.5.5.5" },
      body: JSON.stringify({ action: "admin-login", email: "sg16global@gmail.com", password: "operator-password-123" }),
    }),
    "/api/identity",
    deps(e),
  );
  assert.equal(login?.status, 200);
  const { token } = (await login?.json()) as { token: string };

  const me = await designCompatRoute(
    new Request("https://x/api/identity", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "me" }),
    }),
    "/api/identity",
    deps(e),
  );
  const meBody = await me?.json();
  assert.equal(meBody.admin, true);
  assert.equal(meBody.email, "sg16global@gmail.com");

  // guard: without a token the mint must refuse
  const denied = await designCompatRoute(
    new Request("https://x/api/admin/project-keys", { method: "POST", body: JSON.stringify({ project: "x" }) }),
    "/api/admin/project-keys",
    deps(e),
  );
  assert.equal(denied?.status, 401);

  const mint = await designCompatRoute(
    new Request("https://x/api/admin/project-keys", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ project: "KidsApp" }),
    }),
    "/api/admin/project-keys",
    deps(e),
  );
  const mintBody = (await mint?.json()) as { project: string; key: string };
  assert.equal(mintBody.project, "kidsapp");
  assert.equal((await verifyProjectKey(mintBody.key, PROJECT_SECRET, []))?.project, "kidsapp");

  const state = await designCompatRoute(
    new Request("https://x/api/admin/project-keys", { headers: { authorization: `Bearer ${token}` } }),
    "/api/admin/project-keys",
    deps(e),
  );
  assert.equal((await state?.json()).configured, true);
});

// a pass record in exactly the shape the design pages send (X-SG16-Pass)
function passHeader(): string {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 24 * 3600;
  const nonce = randomBytes(18).toString("base64url");
  const token = createHmac("sha256", BILLING_SECRET).update(`sg16-pass-v1|day||3|${expires}|${nonce}`).digest("hex");
  const record = {
    pass: "day", label: "24-Hour Entry", provider: "dodo", region: null, list_price: 3,
    price_charged: 3, humanitarian_bypass: false, activated_at: now, expires_at: expires, nonce, token, verified_by: "sg16-host",
  };
  return Buffer.from(JSON.stringify(record)).toString("base64url");
}

test("POST /api/brain: pass-gated ChatReply, ndjson stream, honest refusals", async () => {
  const e = env({ LOGS: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as never });

  // no pass -> clear message, not a silent unreachable
  const noPass = await designCompatRoute(
    new Request("https://x/api/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) }),
    "/api/brain",
    deps(e),
  );
  assert.equal(noPass?.status, 402);
  assert.match((await noPass?.json()).error, /pass is required/i);

  // with a pass -> old ChatReply shape
  const reply = await designCompatRoute(
    new Request("https://x/api/brain", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sg16-pass": passHeader() },
      body: JSON.stringify({ sessionId: "s-1", message: "hi", history: [] }),
    }),
    "/api/brain",
    deps(e),
  );
  const body = (await reply?.json()) as {
    sessionId: string; brain: string;
    userMessage: { role: string; content: string };
    assistantMessage: { content: string; latencyMs: number };
  };
  assert.equal(reply?.status, 200);
  assert.equal(body.sessionId, "s-1");
  assert.equal(body.brain, "model-vps");
  assert.equal(body.userMessage.role, "user");
  assert.equal(body.userMessage.content, "hi");
  assert.equal(body.assistantMessage.content, "hello");
  assert.equal(body.assistantMessage.latencyMs, 7);

  // stream:true -> x-ndjson with one delta then done
  const stream = await designCompatRoute(
    new Request("https://x/api/brain", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sg16-pass": passHeader() },
      body: JSON.stringify({ message: "hi", stream: true }),
    }),
    "/api/brain",
    deps(e),
  );
  assert.match(stream?.headers.get("content-type") ?? "", /x-ndjson/);
  const lines = ((await stream?.text()) ?? "").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].type, "delta");
  assert.equal(lines[0].text, "hello");
  assert.equal(lines[1].type, "done");
  assert.equal(lines[1].assistantMessage.content, "hello");

  // core refusal codes map to the panel's honest error text
  const busy = await designCompatRoute(
    new Request("https://x/api/brain", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sg16-pass": passHeader() },
      body: JSON.stringify({ message: "hi" }),
    }),
    "/api/brain",
    deps(e, async () => Response.json({ error: "queue", status: 429 }, { status: 429 })),
  );
  assert.equal(busy?.status, 429);
  assert.equal((await busy?.json()).rateLimited, true);

  // forgetSessionId (new chat) is a harmless ack
  const forget = await designCompatRoute(
    new Request("https://x/api/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ forgetSessionId: "old" }) }),
    "/api/brain",
    deps(e),
  );
  assert.equal((await forget?.json()).forgotten, true);
});

test("GET /api/models: one honest model; engines only for the operator", async () => {
  const e = env();
  const pub = await designCompatRoute(new Request("https://x/api/models"), "/api/models", deps(e));
  const pubBody = (await pub?.json()) as { models: { status: string }[] };
  assert.equal(pubBody.models.length, 1);
  assert.equal(pubBody.models[0].id, "sg16-brain");
  assert.equal(pubBody.models[0].status, "online");
  assert.equal("engines" in pubBody, false);

  const token = await signIdentityToken("sg16global@gmail.com", IDENTITY_SECRET);
  const admin = await designCompatRoute(
    new Request("https://x/api/models", { headers: { authorization: `Bearer ${token}` } }),
    "/api/models",
    deps(e),
  );
  const adminBody = (await admin?.json()) as { engines: unknown[] };
  assert.ok(Array.isArray(adminBody.engines) && adminBody.engines.length > 0);
});
