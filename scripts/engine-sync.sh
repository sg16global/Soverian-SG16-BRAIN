#!/usr/bin/env bash
# ============================================================
# SG16 ENGINE SYNC — make the on-device engine actually runnable
#
# The FRIEND engine (browser-side transformers.js) needs two things that are
# NOT in git, by deliberate policy: the ONNX runtime binaries and the model
# weights. They are immutable per version, they are large, and they belong on
# the edge/CDN (or the device), never in a repository.
#
# This script:
#   1. copies the ONNX runtime out of node_modules into pointoni/public/onnx
#      (via scripts/sync-onnx.js — the same step the platform's postinstall
#      runs, so a fresh clone and a live deploy cannot drift);
#   2. verifies what is actually present and reports it honestly — a missing
#      runtime is reported as MISSING, never as "ready";
#   3. optionally reports the transformers.js cache location for a warm host.
#
# Usage:
#   bash scripts/engine-sync.sh            # sync + verify
#   bash scripts/engine-sync.sh --strict   # non-zero exit if anything missing
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PONTO="$ROOT/pointoni"
DEST="$PONTO/public/onnx"
STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

echo "== SG16 ENGINE SYNC =="
echo "repo: $ROOT"

echo
echo "== (1/3) onnx runtime -> public/onnx =="
if [ -d "$PONTO/node_modules" ]; then
  node "$ROOT/scripts/sync-onnx.js" || echo "!! sync-onnx reported a failure"
else
  echo "!! pointoni/node_modules absent — run: (cd pointoni && npm ci)"
fi

echo
echo "== (2/3) verify runtime binaries =="
EXPECTED=(
  "ort-wasm-simd-threaded.wasm"
  "ort-wasm-simd-threaded.mjs"
  "ort-wasm-simd-threaded.jsep.wasm"
  "ort-wasm-simd-threaded.jsep.mjs"
)
MISSING=0
if [ -d "$DEST" ]; then
  for f in "${EXPECTED[@]}"; do
    if [ -f "$DEST/$f" ]; then
      printf '  [ ok ]  %-40s %s\n' "$f" "$(du -h "$DEST/$f" | cut -f1)"
    else
      printf '  [MISS]  %-40s\n' "$f"
      MISSING=$((MISSING + 1))
    fi
  done
else
  echo "  [MISS]  public/onnx/ does not exist yet"
  MISSING=${#EXPECTED[@]}
fi

echo
echo "== (3/3) engine posture =="
if command -v node >/dev/null; then
  echo "  node            $(node -v)"
fi
echo "  build           $([ -d "$PONTO/.next" ] && echo 'present (pointoni/.next)' || echo 'not built — run: cd pointoni && npx next build')"
CACHE="${TRANSFORMERS_CACHE:-$HOME/.cache/huggingface}"
if [ -d "$CACHE" ]; then
  echo "  weight cache    $CACHE (warm)"
else
  echo "  weight cache    $CACHE (cold — weights download once per device at first use)"
fi

echo
if [ "$MISSING" -eq 0 ]; then
  echo "== ENGINE READY — runtime served from our own static path, no third-party CDN =="
else
  echo "== ENGINE INCOMPLETE — $MISSING runtime file(s) missing =="
  echo "   (the platform still answers: the engine is a device-side path, not a hard dependency)"
  [ "$STRICT" -eq 1 ] && exit 1
fi
exit 0
