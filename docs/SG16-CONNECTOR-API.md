# SG16 CONNECTOR API — how every future body plugs into the brain

*Doctrine: **SG16 is the power plant; projects are bodies.** Each domain has its
own face, own algorithms, own math — and draws reasoning power from one brain via
one small API. This document is the contract every future project connects against.
Bodies launch only after the brain is complete; this file freezes the cable.*

---

## 1. One endpoint to rule the bodies

```
POST /api/brain
Content-Type: application/json
Authorization: Bearer <sovereign-token>     # optional — elevates to WORK mode
{
  "sessionId": "optional-uuid-to-continue",
  "modelId":   "sg16-brain",                # exclusive core; directory models are atlas-only
  "message":   "any natural-language input"
}
```

Response:

```json
{
  "sessionId": "…", "userMessage": {…}, "assistantMessage": {…},
  "brain": "core", "tier": "free | work"
}
```

- Per-response reality tags: `brain: core | fallback-local | relay`, `latencyMs`, `relay`.
- Rate headers on every reply: `X-Chat-Tier`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` — every body gets identical fairness for free.
- 429 carries a human message + `retryAt` — bodies must surface it, not hide it.

## 2. Same brain, every body — the allowed shapes

| Body | Flavor | Same call, different costume |
|---|---|---|
| mistralbrain.com | full sovereign platform (today's build — reference body) | ChatPanel UI, vaults & capsule |
| sg16children.com | guarded kid edition — no login, no vault, simplified prompts, parent-safe | thin shell, one fetch, *no* identity |
| sg16finance.com | market analyst — inject ticker snapshot into `message`, read `assistantMessage` | chain with the demo-tape source |
| sg16engine.com | weights/engine CDN + docs + this API | host-only, calls nothing |
| corporate domains | projector/window into the brain | embedded mini-chat |

A body is *only ever* a shell around this POST. No body ever asks for a model other than `sg16-brain`.

## 3. Tiers the API enforces automatically

```
guest shell           → free  20  msgs/hour per visitor IP
signed-in shell       → same until a pass is vaulted to the email
subscriber shell      → work  500 msgs/hour (Bearer token from /api/identity)
humanitarian region   → unlimited, zero-rate billing bypass (existing rule, all bodies inherit it)
```

Bodies don't implement licenses. They forward Bearer. The brain enforces.

## 4. Zero-storage guarantee bodies inherit

- Showroom brain holds sessions in volatile memory only; the copy-of-record always moves to the user's own device/capsule.
- Identity = one email column, ever. Pass vaulting ready now (`/api/identity`) on every domain.
- Children's shape: shells skip identity entirely (no fetch of `/api/identity`) — no data exists to protect, anywhere.

## 5. Frozen invariants (bodies must NOT break)

1. Exclusive model routing — `modelId` always `sg16-brain` from the world's point of view; internal tiers are the brain's private business.
2. `X-Chat-Tier` shown honestly to every body-user.
3. Demonstration data is labeled demonstration (tickers, analytics).
4. Humanitarian bypass is replicated, never wired off, in new bodies.
5. Style can differ per body; math/routing/core ownership never differ.

## 6. Reference call (copy-paste — what every satellite needs)

```ts
const r = await fetch(BRAIN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ message: userText, modelId: "sg16-brain", sessionId }),
});
const { assistantMessage, sessionId: sid, tier } = await r.json();
// show assistantMessage.content; store nothing; keep tier visible; cache nothing.
```

*Bodies live on their own domains and their own look; they never fork the core, they draw power from it. When a body grows traffic, the answer is a mirror/sister host behind the same signed manifest — never a vendor API.*

— connector v1 · SAIF TECH GLOBAL LLC · the power plant stays singular, the bodies multiply
