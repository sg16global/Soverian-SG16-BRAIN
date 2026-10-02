// Run with: npm test
// The public sees "Sovereign SG16 Brain" - not which model is inside, not other models' names invented
// as if they were connected, and not the inner engine in API answers.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { distillCharter } from "./charter-prompt.ts";
import { publicEngine } from "./public-engine.ts";
import { directProbe } from "./rate-limit.ts";
import { RUNTIME_LABEL } from "./ollama-brain.ts";

const SRC = path.resolve(import.meta.dirname, "..");

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

// code that is internal or operator-only may name the engine; nothing a visitor can read may
const INTERNAL = [
  /[\\/]app[\\/]api[\\/]/,
  /[\\/]app[\\/]admin[\\/]/,
  /\.test\.ts$/,
  /lib[\\/](ollama-brain|answer-ladder|metrics|language|child-safety|turnstile|warm-alias|public-engine|charter-prompt)\.ts$/,
];

test("no page, component or visitor-facing text names the inner model or its engine", () => {
  const offenders: string[] = [];
  for (const f of files(SRC)) {
    if (INTERNAL.some((re) => re.test(f))) continue;
    // the domain name is the operator's own and is not a claim about what is inside
    const text = fs.readFileSync(f, "utf8").replace(/mistralbrain\.com/gi, "");
    if (/mistral|ollama/i.test(text)) offenders.push(path.relative(SRC, f));
  }
  assert.deepEqual(offenders, []);
});

test("the system prompt never names the model, and tells the brain to keep it private yet never lie", () => {
  for (const body of ["flagship", "children"] as const) {
    // exactly what the bridge sends: the runtime line is RUNTIME_LABEL, nothing else names an engine
    const prompt = distillCharter(body, { runtime: RUNTIME_LABEL });
    assert.doesNotMatch(prompt, /mistral|ollama|7b|llama/i, body);
  }
  assert.doesNotMatch(RUNTIME_LABEL, /mistral|ollama/i);
  const prompt = distillCharter("flagship");
  assert.match(prompt, /You ARE Sovereign SG16 Brain/);
  assert.match(prompt, /Do not name that model or its maker unprompted/);
  assert.match(prompt, /Never deny being an AI/);
  assert.match(prompt, /Do not invent a history for yourself/);
  assert.match(prompt, /never say another product lacks safeguards/);
});

test("visitor-facing copy no longer describes the Brain as a limited 'structural core' or a multi-model relay", () => {
  const offenders = files(SRC)
    .filter((f) => !INTERNAL.some((re) => re.test(f)) && !/ai-engine\.ts$/.test(f))
    .filter((f) => /structural core|structural engine|multi-model|optional external relay|illustrative unless/i.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});

test("there is no invented multi-model grid or model registry any more", () => {
  assert.equal(fs.existsSync(path.join(SRC, "lib/ai-registry.ts")), false);
  assert.equal(fs.existsSync(path.join(SRC, "components/home/ModelGrid.tsx")), false);
  const hits = files(SRC)
    .filter((f) => !/\.test\.ts$/.test(f))
    .filter((f) => /GPT-4o|Claude 3|Gemini 1|Gemini 2|DeepSeek-V3|Llama 3\.|Grok 2|Qwen 2\.5|Ernie/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(hits, []);
});

test("the public engine label: inner engines all read 'sg16'; outcomes about the request keep their names", () => {
  for (const inner of ["ollama", "core", "fallback-local"]) assert.equal(publicEngine(inner), "sg16", inner);
  for (const outcome of ["core-gate", "busy", "rate-limited", "child-fallback", "child-crisis"]) assert.equal(publicEngine(outcome), outcome, outcome);
});

test("a visitor coming through the public proxy is never a direct probe, even though the proxy adds the secret", () => {
  const env = { SG16_PROXY_AUTH_SECRET: "s".repeat(40) } as unknown as NodeJS.ProcessEnv;
  const secret = { "x-sg16-proxy-auth": "s".repeat(40) };
  // our own script talking straight to the web port: secret, no visitor address
  assert.equal(directProbe(new Headers(secret), env), true);
  // a visitor: the proxy adds the secret AND the visitor address
  assert.equal(directProbe(new Headers({ ...secret, "x-forwarded-for": "203.0.113.9" }), env), false);
  assert.equal(directProbe(new Headers({ ...secret, "cf-connecting-ip": "203.0.113.9" }), env), false);
  assert.equal(directProbe(new Headers({ ...secret, "x-real-ip": "203.0.113.9" }), env), false);
  // no secret at all, or the wrong one: never
  assert.equal(directProbe(new Headers(), env), false);
  assert.equal(directProbe(new Headers({ "x-sg16-proxy-auth": "wrong" }), env), false);
  assert.equal(directProbe(new Headers(secret), {} as unknown as NodeJS.ProcessEnv), false);
});

test("the chat route shows the exact engine only to direct probes and project keys", () => {
  const route = fs.readFileSync(path.join(SRC, "app/api/brain/route.ts"), "utf8");
  assert.match(route, /exactEngine = fromProject \|\| directProbe\(req\.headers\)/);
  assert.equal((route.match(/brain: shown\(turn\.brain\)/g) ?? []).length, 2);
  assert.doesNotMatch(route, /brain: turn\.brain/);
});
