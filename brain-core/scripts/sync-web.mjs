#!/usr/bin/env node
// Stage the sovereign web client (../web, served raw as ES modules - no
// bundler) into brain-core/client/ for Workers static assets.
//   web/index.html      -> client/index.html
//   web/src/*            -> client/src/*
//   web/public/assets/*  -> client/assets/*   (the client fetches /assets/..)
// Run before every deploy: `npm run web:sync`. client/ is not committed.

import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "..", "web");
const client = join(here, "..", "client");

if (!existsSync(join(web, "index.html"))) {
  console.error("web/index.html not found at " + web);
  process.exit(1);
}
rmSync(client, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
cpSync(join(web, "index.html"), join(client, "index.html"));
cpSync(join(web, "src"), join(client, "src"), { recursive: true });
cpSync(join(web, "public", "assets"), join(client, "assets"), { recursive: true });
console.log("client staged: index.html, src/, assets/ -> " + client);
