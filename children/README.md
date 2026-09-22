# The Children's Friend — `sg16children.com`

A **body** of the SG16 power plant. One static page, one fetch, nothing else.

Open `index.html` directly, or drop this folder on any static host (it needs no
build step, no dependencies and no server). Then point the body at the power
plant by editing the single `BRAIN_URL` line near the top of the `<script>`.

```js
var BRAIN_URL = "https://mistralbrain.com/api/brain";
```

If the body is served from a different domain than the power plant, that domain
**must** be listed in `SG16_CHILDREN_ORIGINS` on the platform (comma separated,
never `*`) — otherwise the CORS children lock refuses the browser call:

```bash
SG16_CHILDREN_ORIGINS=https://sg16children.com,https://www.sg16children.com
```

## What this body does not have — on purpose

| Absent | Why |
|---|---|
| Login, email, magic code | no identity surface of any kind (charter §4) |
| Capsule, vault, session archive | nothing is written down, anywhere |
| Analytics, pixels, trackers | visits belong to nobody |
| Cookies | none are set; none are needed |
| `sessionId` | every turn is a fresh, stateless call |
| `localStorage` | the transcript lives in the tab and dies with the tab |

## What the platform does about it

- `/api/identity` returns **403** to a children origin — the lock is enforced,
  not merely un-mounted in the UI.
- `/api/brain` keeps **no session row and no message row** for a children
  origin, and uses a fresh ephemeral core session per turn, so no two children
  ever share context.
- `GET /api/brain?sessions=1` from a children origin returns an empty list, and
  `GET /api/brain?session=<id>` is refused — a shared archive is unreachable
  from this domain.
- The tier is fixed at **FREE · FRIEND**; a fair-use pause is written warmly and
  never turns into a sales pitch.

## The pledge line (frozen wording)

> "All proceeds collected from paying regions are pledged to children's causes
> through UNICEF- and UNESCO-aligned programmes."

**Legal guardrail:** this is a pledge of funds. It is never an implication of
endorsement, partnership or affiliation. No UNICEF or UNESCO logo may appear on
this site, and copy reads "supporting children's education via UNICEF & UNESCO
programmes". If an official agreement is ever signed, the pledge-line becomes a
partnership-line with no code change.

## The kids' footprint

- Big input font, word-bank question ideas, one clear action.
- Warm, patient, protective tone — short sentences, no jargon, never frightening.
- Guardrails cascade from the SG16 charter: Section 8 (child safety, absolute and
  permanent) and Section 22 (the permanent behavioural hierarchy).

---

*The poorest kid in Gaza and the richest kid in Geneva open this domain and meet
the same friend with the same smile — that is the whole charter.*
