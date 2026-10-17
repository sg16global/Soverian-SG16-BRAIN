# AGENTS.md — standing rules for this repository

These rules apply to every engineer and agent working on SG16. Higher-level
docs may add rules; nothing may remove these.

## 1. The public design is protected

`mistralbrain.com`'s visible design (`brain-core/site/`, mirrored from the
pointoni app) was built by the owner over many hours, and the owner has
requested repeatedly: **do not destroy or replace the public design.**

- No change to the homepage or any public page's look without the owner's
  explicit approval on the specific change.
- Deploys must stage the design via `brain-core/scripts/sync-web.mjs`
  (`site/` is the front-end; the pass-gated chat panel lives at `/panel/`).
- A change is "approved" only when the owner has seen and accepted it —
  never assume visual changes are wanted as part of backend work.
- If a task would alter what visitors see, stop and ask first.

## 2. The brain and the design are separate concerns

Backend work (Worker routes, D1, KV, the VPS model server, payments) must
proceed without touching `brain-core/site/` or `web/` unless the task
explicitly names them.

## 3. Deploy discipline

- `main` deploys automatically on push (`.github/workflows/brain-core-deploy.yml`).
- The cutover of 2026-10-17 replaced the owner's design with a plain panel
  without approval. That must not happen again — the design is now committed
  (`brain-core/site/`) precisely so no deploy or sync can revert it.
