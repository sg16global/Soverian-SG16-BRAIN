# BRAIN-CORE REBUILD — the sovereign split framework

Rebuild of mistralbrain.com as: deterministic core on Cloudflare Workers,
inference-only VPS behind a Cloudflare Tunnel, universal language handling,
one-at-a-time queue discipline. Code: `brain-core/`. This is the runbook.

## Architecture

```
                                    ┌─────────────────────────────────┐
 visitor / project key ──▶ HTTPS ──▶│ Cloudflare Worker: sg16-brain-core│
                                    │  KV keys · DO queue · DO matrix  │
                                    │  D1 logs · verification · math   │
                                    └───────────┬─────────────────────┘
                                                │ semaphore = 1, FIFO, lease expiry
                                                │ Cloudflare Tunnel + Access service token
                                                ▼
                                   VPS (24 GB): Ollama/llama.cpp, two brains:
                                   chat = Qwen 2.5 1.5B fp16 (~3.1 GB),
                                   coding = Qwen 2.5 Coder 7B Q8_0 (~8.1 GB), both resident,
                                   bound to 127.0.0.1, ctx 8192, zero open ports
                                                │ if the VPS fails, the request fails honestly (502)
                                                ▼
                                   (no third-party AI API exists in this system)
```

RAM budget on the 24 GB VPS: ~11 GB weights (1.5B fp16 + 7B Q8_0) + ~1 GB KV
cache (8K ctx, both) + ~2 GB OS/runtime ≈ 14 GB, with headroom. Owner decision
2026-10-19: speed first — the chat brain keeps full true weights (fp16); the
coding brain is Q8_0 because 7B fp16 (~15 GB) is too slow on this CPU-only box.
Both are Apache 2.0 (the 3B coder was removed: research-only license). Both
models stay loaded (OLLAMA_MAX_LOADED_MODELS=2, OLLAMA_KEEP_ALIVE=30m,
never -1). The old brain (devstral, Q4_K_M ~14 GB) is removed by the setup
script.

## Language sovereignty (what changed)

- **No hardcoded language logic anywhere.** No Bengali prompts, no Bengali
  system strings, no language-specific routing, no per-language flags.
- **Universal autodetect:** `brain-core/src/detect.ts` walks Unicode script
  ranges — Latin, Arabic, Bengali, Devanagari, Thai, Han, Hangul, Amharic,
  every major system — and reports the dominant script of each message. It is
  generic over all scripts: nothing is special-cased, and nothing routes on it.
- **One universal prompt rule** (`brain-core/src/prompt.ts`):
  *"Always reply in the same language the user writes in."* Mixed input → the
  dominant language. The detected script is passed to the model generically.
- **The core speaks only machine codes** (`E_RATE_LIMIT`, `E_UNVERIFIED`, ...)
  with standard HTTP status. Human language is produced exclusively by the
  model layer and is verified by the core before it is accepted.

Honest note: the model, not the core, decides reply quality in each language.
The old Bengali honesty fallback was removed per the rebuild spec — if the
new model writes a language badly, that becomes visible instead of masked.

## Integration order (exact)

1. **VPS — model server** (as root, on the 24 GB box):
   ```bash
   MODE=ollama MODEL_PORT=8081 bash scripts/vps-setup-model.sh
   ```
   Ollama is bound to 127.0.0.1:8081 (8080 is still held by the old
   sg16-core until cutover), `OLLAMA_CONTEXT_LENGTH=8192`,
   `OLLAMA_MAX_LOADED_MODELS=2` (both small brains stay resident),
   `OLLAMA_KEEP_ALIVE=30m` (finite default — never -1). The script pulls
   `qwen2.5:1.5b-instruct-fp16` (chat) and
   `qwen2.5-coder:7b-instruct-q8_0` (coding) and removes the old brain
   (`ollama rm devstral`). `MODE=llamacpp` builds llama.cpp, downloads both
   GGUFs (chat fp16, coder Q8_0) and runs one llama-server per brain (chat on 8081, coder on 8082).
2. **VPS — tunnel**: the script installs cloudflared, creates tunnel
   `sg16-model`, maps `model.mistralbrain.com` to
   `http://127.0.0.1:8081` and enables it as a service.
3. **Cloudflare Zero Trust — Access**: self-hosted app for
   `model.mistralbrain.com`, policy = deny all except one
   **Service Token**. Note the Client ID and Client Secret.
4. **Git — deploy the Worker**:
   ```bash
   cd brain-core
   npm install
   npx wrangler kv namespace create KEYS        # id -> wrangler.jsonc
   npx wrangler d1 create sg16_logs             # id -> wrangler.jsonc
   npx wrangler d1 execute sg16_logs --file schema.sql
   ```
   Secrets (no third-party AI API secret exists — there is no backup route):
   ```bash
   npx wrangler secret put MODEL_SHARED_SECRET
   npx wrangler secret put CF_ACCESS_CLIENT_ID
   npx wrangler secret put CF_ACCESS_CLIENT_SECRET
   ```
   `npx wrangler deploy`, then attach the `mistralbrain.com` hostname to the
   Worker (Workers -> Triggers -> Add custom domain).
   CI/CD: `.github/workflows/brain-core-deploy.yml` redeploys on every push
   to `main` that touches `brain-core/`.
5. **Keys** — one system for every consumer, owner included:
   ```bash
   node scripts/make-key.mjs                        # owner = user 1
   node scripts/make-key.mjs --user 2 --project pointoni
   ```
   Each prints the key ONCE and the exact `wrangler kv key put` command.
   Rotation is `POST /v1/keys` with the current key — the same path for
   the owner; the owner is user #1, never above the system.
6. **Load test** — 10 concurrent project connections:
   ```bash
   node scripts/loadtest.mjs keys.txt
   ```
   Criteria: all 10 end 200; upstream inference never runs twice at once;
   `free -m` on the VPS stays flat. The queue (Durable Object) absorbs the
   load; a crashed caller's slot is reclaimed by lease expiry.

## Queue discipline (how flooding is impossible)

`InferenceQueueDO` (name `global`) holds one semaphore. `acquire` returns
either the slot or a FIFO position plus a per-request deadline
(`min(policy.max_queue_ms, MAX_QUEUE_WAIT_MS)`). The Worker polls until
granted or expired, then calls the VPS exactly once. `release` frees the slot
and grants the next ticket. If a caller dies without releasing, the lease
expires (`leaseMs`, default 240 s — two 60 s draft attempts plus the 60 s
self-check pass, with headroom) and the next acquire reclaims the slot —
no deadlock, no flood, no OOM from concurrency.

## Verification (the core never trusts the model)

Every model output is self-checked before the user sees it: the same model
re-reads its own draft (`prompt.ts` `checkMessages`) and either confirms it
(exactly "OK") or returns a corrected answer; the correction must pass
`verify.ts` too, and a failed check never takes the verified draft away
(`meta.checked` reports which happened). The draft itself passes `verify.ts`
before it is accepted: structure (JSON `{answer}` when the project requires
it), size cap, control-character check, and the project's blocked regex
patterns. One retry on failure; a second failure rejects with
`E_UNVERIFIED`. Compute and state routes never touch the model at all.

## Zero open ports (cutover)

Today the VPS still runs the old stack (Caddy :80/:443, sg16-core :8080).
After the Worker serves `mistralbrain.com` and the load test passes:

1. Stop and disable the old stack: `systemctl disable --now caddy sg16-core
   sg16-web` (keep the healthcheck timer pointed at the Worker).
2. Close everything: `ufw default deny incoming && ufw allow outgoing &&
   ufw enable`. The tunnel is outbound-only, so the model stays reachable.
3. SSH is the one service you still need: move it behind the tunnel
   (`cloudflared access ssh`, Zero Trust docs) before closing port 22 —
   otherwise the box becomes unreachable.
4. Keep the daily off-host backups (state, .env, Caddyfile) until the old
   stack is fully retired; after that, back up the Worker via
   `wrangler kv key list` and D1 export.

## Constraints honored

- No OpenAI, Google, or any third-party AI API — none exists in this system.
  The former `mistral.ts` backup route was removed (owner decision
  2026-10-19); if the VPS is down, chat fails honestly with 502.
- Everything real: D1 stores real request rows and history digests only —
  no synthetic metrics, no fake counters.
- Owner's only role: security — Access policies, WAF, key rotation. The
  brain's logic has no owner override; the owner authenticates with the same
  key system as everyone else (user #1).

## Open items the owner must decide

- **New brain-core repo**: the spec says a separate repository. The package
  is self-contained (`brain-core/`) — push it as its own repo with
  `git subtree split` or copy the directory; the workflow and wrangler
  config need no changes.
- **SSH trade-off**: "zero open ports" taken literally means no direct SSH;
  the tunnel-based SSH setup above is the only way in. Decide before closing
  the firewall.
- **D1 history** stores digests (not message text) — this keeps the
  original zero-data promise for content while satisfying the log/history
  requirement. Set `policy.LOG_CONTENT=1` only if you truly want full text
  stored.
- **The old stack** (`sg16/`, `pointoni/`, `web/`) stays untouched and
  serving until the cutover above.
