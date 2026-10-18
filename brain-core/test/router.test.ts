import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import type { Env } from "../src/index.ts";
import { newKey, keyHash } from "../src/keys.ts";
import { InferenceGate } from "../src/inference-gate.ts";
import { KeyState, newRow } from "../src/matrix-do.ts";
import type { MatrixRow } from "../src/matrix-do.ts";

// ---- fake bindings --------------------------------------------------------

class FakeKV {
  map = new Map<string, string>();
  async get(k: string) { return this.map.get(k) ?? null; }
  async put(k: string, v: string) { this.map.set(k, v); }
}

class FakeD1 {
  prepare(_sql: string) {
    const stmt = {
      bind: () => stmt,
      run: async () => ({}),
      first: async () => ({}),
    };
    return stmt;
  }
}

function queueNamespace(gate: InferenceGate) {
  return {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (url: string, init?: RequestInit): Promise<Response> => {
        const path = new URL(url).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (path === "/acquire") return json(gate.acquire(body.waitBudgetMs));
        if (path === "/poll") return json(gate.poll(body.ticket));
        if (path === "/release") return json({ released: gate.release(body.ticket) });
        if (path === "/abandon") { gate.abandon(body.ticket); return json({ abandoned: true }); }
        if (path === "/stats") return json(gate.stats());
        return json({ ok: false }, 404);
      },
    }),
  };
}

function matrixNamespace() {
  const rows = new Map<string, MatrixRow>();
  return {
    rows,
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (url: string, init?: RequestInit): Promise<Response> => {
        const u = new URL(url);
        const path = u.pathname;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const ensure = (keyId: string, project: string, now: number) => {
          if (!rows.has(keyId)) rows.set(keyId, newRow(keyId, project, now));
          return new KeyState(rows.get(keyId)!);
        };
        if (path === "/check") {
          const ks = ensure(body.key_id, body.project, body.now);
          const verdict = ks.check(body.now, body.rpm);
          if (verdict.allowed) ks.consume(body.now);
          return json(verdict);
        }
        if (path === "/step") {
          const ks = ensure(body.key_id, body.project, body.now);
          return json({ score: ks.step(body.delta) });
        }
        if (path === "/state") {
          const key = u.searchParams.get("key_id");
          return json(key ? rows.get(key) ?? {} : Object.fromEntries(rows));
        }
        return json({ ok: false }, 404);
      },
    }),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// ---- fetch interception ----------------------------------------------------

let modelHandler: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
const realFetch = globalThis.fetch;

beforeEach(() => {
  modelHandler = null;
});

// ---- env ------------------------------------------------------------------

async function makeEnv(overrides: Partial<Env> = {}) {
  const kv = new FakeKV();
  const gate = new InferenceGate({ waitBudgetMs: 5000, leaseMs: 60000 });
  const matrix = matrixNamespace();
  const { key } = newKey();
  const owner = { id: "k_owner", user: 1, project: "platform", created: 1, revoked: false };
  kv.map.set(await keyHash(key), JSON.stringify(owner));

  const env = {
    KEYS: kv as unknown as KVNamespace,
    LOGS: new FakeD1() as unknown as D1Database,
    QUEUE: queueNamespace(gate) as unknown as DurableObjectNamespace,
    MATRIX: matrix as unknown as DurableObjectNamespace,
    MODEL_PROVIDER: "ollama",
    MODEL_URL: "https://model.internal.mistralbrain.com",
    MODEL_NAME: "qwen2.5:1.5b-instruct-fp16",
    MODEL_NAME_CODER: "qwen2.5-coder:7b-instruct-q8_0",
    MODEL_NUM_CTX: "8192",
    MAX_OUTPUT_CHARS: "1000",
    INFERENCE_TIMEOUT_MS: "5000",
    MAX_QUEUE_WAIT_MS: "5000",
    ...overrides,
  } as Env;

  (globalThis.fetch as unknown) = async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (modelHandler) return modelHandler(href, init);
    return realFetch(url as never, init);
  };

  return { env, key, kv, gate, matrix };
}

const ctx = {
  waitUntil: (p: Promise<unknown>) => {
    p.catch(() => {});
    return p;
  },
} as unknown as ExecutionContext;

async function call(env: Env, path: string, method: string, key: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return worker.fetch!(
    new Request(`https://brain.mistralbrain.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env,
    ctx,
  );
}

// ---- tests ----------------------------------------------------------------

test("no key => 401 with a machine code", async () => {
  const { env } = await makeEnv();
  const res = await call(env, "/v1/ask", "POST", null, { text: "hi" });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, code: "E_UNAUTHORIZED" });
});

test("chat happy path: draft passes the self-check, model and checked flag reported", async () => {
  const { env, key } = await makeEnv();
  const bodies: Array<{ model?: string; messages?: Array<{ role: string; content: string }> }> = [];
  let calls = 0;
  modelHandler = async (url, init) => {
    assert.equal(new URL(url).pathname, "/api/chat");
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)) as never);
    return json({ message: { content: calls === 1 ? "the answer" : "OK" } });
  };
  const res = await call(env, "/v1/ask", "POST", key, { text: "how are you today" });
  assert.equal(res.status, 200);
  const data = await res.json() as {
    ok: boolean; answer: string;
    meta: { engine: string; model: string; checked: boolean; verified: boolean; script: string | null };
  };
  assert.equal(data.answer, "the answer");
  assert.equal(data.meta.engine, "model-vps");
  assert.equal(data.meta.model, "qwen2.5:1.5b-instruct-fp16");
  assert.equal(data.meta.checked, true);
  assert.equal(data.meta.verified, true);
  assert.equal(data.meta.script, "latin");
  assert.equal(calls, 2, "one draft call + one self-check call");
  assert.equal(bodies[0].model, "qwen2.5:1.5b-instruct-fp16");
  assert.ok((bodies[1].messages?.at(-1)?.content ?? "").includes("the answer"), "the checker must see the draft");
});

test("unverifiable model output: one retry, then E_UNVERIFIED", async () => {
  const { env, key } = await makeEnv();
  let calls = 0;
  modelHandler = async () => { calls += 1; return json({ message: { content: "" } }); };
  const res = await call(env, "/v1/ask", "POST", key, { text: "hi there" });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false, code: "E_UNVERIFIED" });
  assert.equal(calls, 2);
});

test("self-check corrects a wrong draft before the user sees it", async () => {
  const { env, key } = await makeEnv();
  let calls = 0;
  modelHandler = async () => {
    calls += 1;
    return json({ message: { content: calls === 1 ? "2+2=5" : "2+2=4" } });
  };
  const res = await call(env, "/v1/ask", "POST", key, { text: "what is 2+2?" });
  assert.equal(res.status, 200);
  const data = await res.json() as { answer: string; meta: { checked: boolean } };
  assert.equal(data.answer, "2+2=4", "the user only ever sees the corrected answer");
  assert.equal(data.meta.checked, true);
});

test("a failed self-check keeps the verified draft (checked: false)", async () => {
  const { env, key } = await makeEnv();
  let calls = 0;
  modelHandler = async () => {
    calls += 1;
    if (calls === 1) return json({ message: { content: "the draft" } });
    throw new Error("check timed out");
  };
  const res = await call(env, "/v1/ask", "POST", key, { text: "hi" });
  assert.equal(res.status, 200);
  const data = await res.json() as { answer: string; meta: { checked: boolean } };
  assert.equal(data.answer, "the draft");
  assert.equal(data.meta.checked, false);
});

test("routing: coding intent goes to the coder brain, chat to the chat brain", async () => {
  const { env, key } = await makeEnv();
  const models: string[] = [];
  let calls = 0;
  modelHandler = async (_url, init) => {
    calls += 1;
    models.push((JSON.parse(String(init?.body)) as { model: string }).model);
    return json({ message: { content: calls % 2 === 1 ? "draft" : "OK" } });
  };
  const code = await call(env, "/v1/ask", "POST", key, { text: "fix this bug:\n```js\nconst x = 1\nconsole.log(y)\n```" });
  assert.equal(code.status, 200);
  const chat = await call(env, "/v1/ask", "POST", key, { text: "how are you today" });
  assert.equal(chat.status, 200);
  assert.equal(models[0], "qwen2.5-coder:7b-instruct-q8_0", "code request -> coder brain");
  assert.equal(models[1], "qwen2.5-coder:7b-instruct-q8_0", "the coder brain also self-checks");
  assert.equal(models[2], "qwen2.5:1.5b-instruct-fp16", "chat request -> chat brain");
});

test("VPS model down: no third-party AI API exists — honest 502, nothing else is called", async () => {
  const { env, key } = await makeEnv();
  let calls = 0;
  modelHandler = async (url) => {
    calls += 1;
    assert.ok(!url.startsWith("https://api.mistral.ai"), "no third-party AI API may be called");
    throw new Error("tunnel down");
  };
  const res = await call(env, "/v1/ask", "POST", key, { text: "hi there" });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false, code: "E_UPSTREAM" });
  assert.equal(calls, 1, "upstream failure propagates immediately — no backup route exists");
});

test("compute is deterministic inside the Worker — no model involved", async () => {
  const { env, key } = await makeEnv();
  let modelCalled = false;
  modelHandler = async () => { modelCalled = true; return json({ message: { content: "x" } }); };
  const res = await call(env, "/v1/ask", "POST", key, { kind: "compute", op: "2+3*4" });
  assert.equal(res.status, 200);
  const data = await res.json() as { result: number; meta: { engine: string } };
  assert.equal(data.result, 14);
  assert.equal(data.meta.engine, "core");
  assert.equal(modelCalled, false);
});

test("compute rejects garbage expressions", async () => {
  const { env, key } = await makeEnv();
  const res = await call(env, "/v1/ask", "POST", key, { kind: "compute", op: "2+__import" });
  assert.equal(res.status, 400);
});

test("per-project policy rate limit: 429 after the budget", async () => {
  const { env, key, kv } = await makeEnv();
  kv.map.set("policy:platform", JSON.stringify({ rpm: 1 }));
  modelHandler = async () => json({ message: { content: "ok" } });
  const first = await call(env, "/v1/ask", "POST", key, { text: "one" });
  assert.equal(first.status, 200);
  const second = await call(env, "/v1/ask", "POST", key, { text: "two" });
  assert.equal(second.status, 429);
  assert.deepEqual(await second.json(), { ok: false, code: "E_RATE_LIMIT" });
});

test("queue discipline: 10 concurrent chats, the model is never called twice at once", async () => {
  const { env, key } = await makeEnv();
  let inflight = 0;
  let peak = 0;
  modelHandler = async () => {
    inflight += 1;
    peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 60));
    inflight -= 1;
    return json({ message: { content: "queued ok" } });
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => call(env, "/v1/ask", "POST", key, { text: `msg ${Math.random()}` })),
  );
  assert.equal(peak, 1, "the VPS must never see two inferences at once");
  assert.equal(results.filter((r) => r.status === 200).length, 10);
  assert.ok((await env.QUEUE.get("global").fetch("https://do/stats")).status === 200);
});

test("state route reads and steps the matrix", async () => {
  const { env, key } = await makeEnv();
  const res = await call(env, "/v1/ask", "POST", key, { kind: "state", op: "score.step", delta: 7 });
  assert.equal(res.status, 200);
  const stepped = await res.json() as { state: { score: number } };
  assert.equal(stepped.state.score, 7);
  const read = await call(env, "/v1/state", "GET", key);
  assert.equal(read.status, 200);
});

test("health reports component status", async () => {
  const { env } = await makeEnv();
  modelHandler = async () => new Response("ok", { status: 200 });
  const res = await call(env, "/v1/health", "GET", null);
  assert.equal(res.status, 200);
  const data = await res.json() as { ok: boolean; kv: boolean; d1: boolean };
  assert.equal(data.ok, true);
  assert.equal(data.kv, true);
  assert.equal(data.d1, true);
});

test("unknown route => 404 machine code", async () => {
  const { env } = await makeEnv();
  const res = await call(env, "/v1/nope", "GET", null);
  assert.equal(res.status, 404);
});

test("key rotation: the new key works and the old one is dead (sg16_ KV keys)", async () => {
  const { env, key } = await makeEnv();
  const res = await call(env, "/v1/keys", "POST", key);
  assert.equal(res.status, 200);
  const out = await res.json() as { key: string };
  assert.match(out.key, /^sg16_[0-9a-f]{32}$/);
  assert.equal((await call(env, "/v1/state", "GET", out.key)).status, 200);
  assert.equal((await call(env, "/v1/state", "GET", key)).status, 401);
});

test("key rotation: a stateless sg16p_ project key is revoked through its fingerprint record", async () => {
  const { createProjectKey } = await import("../src/design-compat.ts");
  const secret = "project-key-secret-0123456789abcdef";
  const { env } = await makeEnv({ SG16_PROJECT_KEY_SECRET: secret });
  const projectKey = await createProjectKey("sg16finance", secret);
  assert.equal((await call(env, "/v1/state", "GET", projectKey)).status, 200);
  const res = await call(env, "/v1/keys", "POST", projectKey);
  assert.equal(res.status, 200);
  const out = await res.json() as { key: string; record: { project: string } };
  assert.equal(out.record.project, "sg16finance");
  assert.equal((await call(env, "/v1/state", "GET", out.key)).status, 200, "the replacement key works");
  assert.equal((await call(env, "/v1/state", "GET", projectKey)).status, 401, "the rotated project key is dead");
});

test("security headers ride on every response: api, errors, redirects, static assets", async () => {
  const { env, key } = await makeEnv({
    ASSETS: { fetch: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) } as unknown as Fetcher,
  });
  const check = (res: Response, what: string) => {
    assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains", what);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", what);
    assert.equal(res.headers.get("x-frame-options"), "DENY", what);
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin", what);
    assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()", what);
  };
  check(await call(env, "/v1/state", "GET", key), "/v1 json");
  check(await call(env, "/v1/ask", "POST", null, { text: "hi" }), "401 error");
  check(await call(env, "/nope/v1", "GET", null), "static asset");
  const asset = await call(env, "/", "GET", null);
  assert.equal(await asset.text(), "<html></html>", "the body passes through untouched");
  const redirect = await worker.fetch!(new Request("https://www.mistralbrain.com/x?y=1"), env, ctx);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://mistralbrain.com/x?y=1");
  check(redirect, "www redirect");
});

test("queue wait: MAX_QUEUE_WAIT_MS is the default and the ceiling; a project policy may only lower it", async () => {
  const waits: number[] = [];
  const waitFor = async (policy: unknown) => {
    const { env, key, kv, gate } = await makeEnv({ MAX_QUEUE_WAIT_MS: "120000" });
    const acquire = gate.acquire.bind(gate);
    gate.acquire = ((ms?: number) => { waits.push(ms ?? -1); return acquire(ms); }) as typeof gate.acquire;
    if (policy) kv.map.set("policy:platform", JSON.stringify(policy));
    modelHandler = async () => json({ message: { content: "ok" } });
    assert.equal((await call(env, "/v1/ask", "POST", key, { text: "hi" })).status, 200);
    return waits.at(-1);
  };
  assert.equal(await waitFor(null), 120000, "no stored policy: the env wait applies (was capped at 45s)");
  assert.equal(await waitFor({ rpm: 60 }), 120000, "a policy without max_queue_ms keeps the env wait");
  assert.equal(await waitFor({ max_queue_ms: 30000 }), 30000, "a project may ask for a shorter wait");
  assert.equal(await waitFor({ max_queue_ms: 600000 }), 120000, "but never a longer one than the env ceiling");
});
