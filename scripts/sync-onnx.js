#!/usr/bin/env node
// sync-onnx — copies the ONNX runtime wasm/js runtime files into
// pointoni/public/onnx so the FRIEND in-browser engine serves its runtime
// from our own static path (doctrine: no third-party CDN for the engine).
// Safe to run repeatedly; no-op if nothing changed.

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "pointoni", "node_modules", "onnxruntime-web", "dist");
const DEST = path.join(__dirname, "..", "pointoni", "public", "onnx");

const NEEDS = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

if (!fs.existsSync(SRC)) {
  console.warn("[sync-onnx] onnxruntime-web not installed yet — skipping (run after npm install)");
  process.exit(0);
}
fs.mkdirSync(DEST, { recursive: true });
let copied = 0;
for (const f of NEEDS) {
  const from = path.join(SRC, f);
  const to = path.join(DEST, f);
  if (!fs.existsSync(from)) continue;
  const sameSize = fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size;
  if (!sameSize) {
    fs.copyFileSync(from, to);
    copied++;
  }
}
console.log(`[sync-onnx] ${copied} file(s) synced → public/onnx (${NEEDS.length} expected)`);
