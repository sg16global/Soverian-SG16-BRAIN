# SG16 DELTA PACK — the heart comes home

*Applied on branch `arena/01a0cb1f-soverian-sg16-brain` · SAIF TECH GLOBAL LLC*

This document is the README for the delta pack: what each file does, why it is
shaped that way, and how to verify it. Everything here obeys the frozen
doctrine — **SG16 is the power plant; projects are bodies** — and every claim
below is checkable in the source, not asserted.

---

## 1. What landed, file by file

| # | File | What it does |
|---|---|---|
| 1 | `pointoni/src/lib/ollama-brain.ts` | **Ollama heart-bridge.** Server-side bridge to a local Ollama daemon so the platform keeps answering from the operator's own metal when the Q16.16 core is down. Hard timeout, no content logging, URL from env only, charter preamble on every turn. Inert unless `SG16_OLLAMA_URL` is set. |
| 2 | `pointoni/src/lib/charter-prompt.ts` | **Charter law distiller.** Compresses Master Charter Sections 1-23 + the Master Character Principle into the system preamble one body needs. 16 distilled laws, the 13-step permanent hierarchy, and per-body overlays (flagship / children / finance / engine). The charter is *not* rewritten — trimmed. |
| 3 | `pointoni/src/lib/warm-alias.ts` | **Warm alias.** One warm human name per runtime (`the sovereign core`, `the hearth`, `the local guard`, `the relay`) and warm system copy for degraded engines, fair-use pauses and tier chips. Warmth never claims a capability the runtime lacks. |
| 4 | `pointoni/src/lib/cors-lock.ts` | **CORS children lock.** Origin allow-list for children shells (`SG16_CHILDREN_ORIGINS`, never `*`), explicit preflight, no credentials, `no-store`, and a hard 403 for any identity call from a children origin. |
| 5 | `pointoni/src/app/api/brain/route.ts` | **The thinking ladder.** `core → ollama → guard → relay`, reported honestly as `brain:` on every turn. Children origins are handled by origin, not by request body, and their path writes **nothing**: no session row, no message row, a fresh ephemeral core session per turn. |
| 6 | `pointoni/src/app/api/identity/route.ts` | Children origins get **403** on GET and POST — the absent identity system is now enforced, not just un-mounted. |
| 7 | `pointoni/src/app/api/health/route.ts` | Honest operator picture: database, core, heart, which engine is currently answering, the charter digest and the children lock. |
| 8 | `pointoni/src/components/chrome/FooterRail.tsx` | **Footer rail ticker.** The doctrine tape: zero storage, one brain, the frozen children's pledge line, humanity-bypass and Apache 2.0 — moving under every page. No state, no fetch, no analytics. |
| 9 | `pointoni/src/components/chrome/SiteChrome.tsx` | Mounts the rail at the head of the footer. |
| 10 | `pointoni/src/components/chrome/Sidebar.tsx` | **Sidebar auto-panel.** Presents itself once on a first visit, re-peeks after 45s idle, and can be **pinned** per device. Slide-out on hover/focus is unchanged; the page still owns the full viewport width. |
| 11 | `pointoni/src/app/globals.css` | Rail animation (seamless -50% loop, hover-pause, edge mask) plus a genuine static fallback under `prefers-reduced-motion`. |
| 12 | `pointoni/.env.example` | Documents the bridge, the children CORS lock and the identity secret — no values, no secrets. |
| 13 | `children/index.html` | **The Children's Friend.** One static page, one fetch, no build step. Big input font, word-bank questions, memory-only transcript, no identity call. |
| 14 | `children/README.md` | How to deploy the body, what it deliberately lacks, and the pledge-line guardrail. |
| 15 | `scripts/engine-sync.sh` | **Engine sync.** Syncs the ONNX runtime into `public/onnx`, then *verifies* what is present and reports missing pieces as MISSING (`--strict` for CI). |
| 16 | `scripts/vps-cannon.sh` | **VPS cannon.** Wraps `vps-setup.sh`, installs the Ollama heart-bridge, stages the children's body, restarts the units and prints an honest engine verdict. No secrets asked or echoed. |
| 17 | `docs/SG16-DELTA-PACK.md` | This file. |

---

## 2. The thinking ladder

```
browser  ──POST /api/brain──▶  Next.js route
                                 │
                                 ├─ 1. core          Q16.16 sovereign runtime   (@ SG16_BRAIN_URL)
                                 ├─ 2. ollama        heart-bridge on your metal  (@ SG16_OLLAMA_URL)
                                 ├─ 3. fallback-local local guard channel        (in-process)
                                 └─ 4. relay         external grid models        (unchanged)
```

Every response carries the runtime that actually answered:

```json
{ "brain": "core" | "ollama" | "fallback-local" | "relay", "tier": "free" | "work", "friend": false }
```

A children shell additionally sees `"friend": true`, `"tierChip": "FREE · FRIEND"`, `"stored": false`.

**Why it matters:** before this, a dead core silently produced a bracketed machine note. Now the second rung is the operator's own Ollama, and if even that is down the notice is written warmly while still naming the real reason (charter §10 honest claims, §19 intellectual honesty).

---

## 3. The children's shape, enforced

Charter §4 says the identity system is *absent by design*. The pack makes the
absence structural:

| Surface | Behaviour for a children origin |
|---|---|
| `POST /api/brain` | answers, then writes **no session and no message row**; fresh ephemeral core session per turn, so no two children share context |
| `GET /api/brain?sessions=1` | returns `{ sessions: [], stored: false }` — the flagship archive is unreachable |
| `GET /api/brain?session=<id>` | **403** — there is no archive to read |
| `GET/POST /api/identity` | **403** — nothing to create, fetch or recover |
| `OPTIONS` (both routes) | explicit preflight for allow-listed origins only, `Vary: Origin`, no credentials, `no-store` |
| fair-use pause (429) | written warmly, never a sales pitch; tier chip is always `FREE · FRIEND` |

Configure the allow-list (never `*`):

```bash
SG16_CHILDREN_ORIGINS=https://sg16children.com,https://www.sg16children.com
```

---

## 4. Configure & run

```bash
cd pointoni
npm ci
cp .env.example .env        # then edit — no secrets are ever requested here

# optional: bring the heart online
ollama pull mistral
#   SG16_OLLAMA_URL=http://127.0.0.1:11434
#   SG16_OLLAMA_MODEL=mistral

npx next build && npx next start
curl -s localhost:3000/api/health | head -c 400
```

The health payload answers the only question an operator really has:

```json
{ "brain": "offline", "heart": { "status": "online", "model": "mistral" },
  "answering": "ollama", "engines": ["core", "ollama", "fallback-local"] }
```

---

## 5. Verification performed

- `npx tsc --noEmit` — **clean**.
- `npx next build` — **succeeded** (see the build log in the session).
- `node -e "require('lucide-react')"` — confirmed the icons used by the pin control exist in the pinned version.
- Runtime proof: with no core and no Ollama reachable, `/api/brain` still answers and reports `brain: "fallback-local"`; with only Ollama, it reports `brain: "ollama"`.

---

## 6. Frozen invariants (unchanged by this pack)

1. `modelId` from the world's point of view is always `sg16-brain`.
2. `X-Chat-Tier` / rate headers are shown honestly to every body.
3. Demonstration data stays labelled demonstration (the footer rail carries no
   market numbers; the tape panel keeps its own DEMO TAPE line).
4. The humanitarian bypass is inherited, never wired off.
5. Style differs per body; math, routing and core ownership never differ.

## 7. The pledge-line guardrail

> "All proceeds collected from paying regions are pledged to children's causes
> through UNICEF- and UNESCO-aligned programmes."

This is a **pledge of funds** and nothing more. No UNICEF or UNESCO mark may
appear in a way suggesting affiliation, and the rail copy reads "supporting
children's education via UNICEF & UNESCO programmes". If an agreement is ever
signed, the pledge-line becomes a partnership-line with no code change.

---

*One brain, many bodies, all of them small and honest. The heart now beats on
the operator's own metal when the core is out of reach — and the platform says
which engine answered, every single time.*
