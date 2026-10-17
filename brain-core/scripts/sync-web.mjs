#!/usr/bin/env node
// Stage the public front-end into brain-core/client/ for Workers assets.
//
//   site/          the sovereign design (mirrored from the pointoni app +
//                  its public assets) — committed, so deploys are
//                  reproducible and CI can never wipe the design.
//   ../web         the pass-gated chat panel, served at /panel/.
//
// Layout after staging:  client/          -> https://mistralbrain.com/
//                        client/panel/    -> https://mistralbrain.com/panel/
// All /api/* and /v1/* requests are handled by the Worker (run_worker_first),
// never by these assets.

import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const brainCore = join(here, "..");
const site = join(brainCore, "site");
const web = join(brainCore, "..", "web");
const client = join(brainCore, "client");

if (!existsSync(join(site, "index.html"))) {
  console.error("site/index.html not found — the design mirror is missing: " + site);
  process.exit(1);
}
if (!existsSync(join(web, "index.html"))) {
  console.error("web/index.html not found at " + web);
  process.exit(1);
}

rmSync(client, { recursive: true, force: true });
mkdirSync(client, { recursive: true });

// the design front-end
cpSync(site, client, { recursive: true });

// the working chat panel at /panel/ (its modules load from /src, assets from /assets)
mkdirSync(join(client, "panel"), { recursive: true });
cpSync(join(web, "index.html"), join(client, "panel", "index.html"));
cpSync(join(web, "src"), join(client, "src"), { recursive: true });
cpSync(join(web, "public", "assets"), join(client, "assets"), { recursive: true });

console.log("staged: design front-end + chat panel at /panel/ -> " + client);
