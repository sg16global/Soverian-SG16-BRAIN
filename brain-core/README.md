# sg16-brain-core

The sovereign, language-neutral brain core — a Cloudflare Worker that owns all
deterministic logic, with an inference-only VPS behind a Cloudflare Tunnel.

```
visitor/project ──▶ Worker (this package)          [deterministic: keys, routing, state, scoring, verification, queue]
                        │  one at a time, FIFO queue (Durable Object)
                        ▼
                   VPS model server (Ollama/llama.cpp, 127.0.0.1 only, zero open ports)
                        via https://model.internal.mistralbrain.com  (Cloudflare Tunnel + Access)
                        fallback: Mistral API — the ONLY third-party route, used only if the VPS fails
```

## Bindings

| Binding | Store | Purpose |
|---|---|---|
| `KEYS` | Workers KV | `sha256(api key) -> key record`; `policy:<project> -> project policy` |
| `LOGS` | D1 (`schema.sql`) | request logs + history digests (real events only) |
| `QUEUE` | Durable Object `InferenceQueueDO` | the single inference slot: semaphore + FIFO + lease expiry |
| `MATRIX` | Durable Object `MatrixDO` | per-key living matrix: rate window, totals, integer score |

## API (language-neutral: machine codes + the model's answer; nothing else)

| Route | Purpose |
|---|---|
| `POST /v1/ask` `{kind:"chat", text}` | gate -> queue -> VPS inference -> verify -> answer |
| `POST /v1/ask` `{kind:"compute", op:"2+3*4"}` | deterministic arithmetic inside the Worker — no model involved |
| `POST /v1/ask` `{kind:"state", op:"score.step", delta}` | matrix state transition |
| `GET /v1/state` | the caller's own matrix row |
| `POST /v1/keys` | rotate the calling key itself (owner included) |
| `GET /v1/health` | kv/d1/queue/model probes |

Errors are always `{ok:false, code:"E_*"}` with the matching HTTP status.
Human language exists only inside `answer` — produced by the model, verified
by the core. No language, script or transliteration habit is special-cased
anywhere; the model receives one universal rule and the detected script.

## Tests

```bash
node --test "test/*.test.ts"     # 31 tests: auth, detect, prompt, verify, queue, matrix, router e2e
```

## Deploy order (exact)

1. `npm install` (installs wrangler)
2. `npx wrangler kv namespace create KEYS` — put the id into `wrangler.jsonc`
3. `npx wrangler d1 create sg16_logs` — put the id into `wrangler.jsonc`; then
   `npx wrangler d1 execute sg16_logs --file schema.sql`
4. VPS: `bash scripts/vps-setup-model.sh` (model server + tunnel)
5. Cloudflare Access app on the tunnel hostname, service token only
6. Secrets: `npx wrangler secret put MODEL_SHARED_SECRET`,
   `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `MISTRAL_API_KEY`
7. `npx wrangler deploy`, then attach the `mistralbrain.com` route to this
   worker in the Cloudflare dashboard (Workers -> Triggers)
8. Keys: `node scripts/make-key.mjs` + the printed `wrangler kv key put`
9. Load test: `node scripts/loadtest.mjs keys.txt` (10 concurrent connections)

Full runbook with cutover and security notes: `../docs/BRAIN-CORE-REBUILD.md`.
