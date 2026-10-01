#!/usr/bin/env bash
# ============================================================
# SG16 LADDER SMOKE TEST — run on the VPS from a fresh clone.
#
# Starts a throwaway copy of the stack and sends real requests through the
# answering ladder (gate -> Ollama -> core -> local guard):
#
#   core      127.0.0.1:8081   (python, scripts/serve.py)
#   platform  127.0.0.1:3001   (next start, in-memory database)
#   ollama    127.0.0.1:11434  (the existing daemon, model below)
#
# It refuses to use ports 8080 / 3000, never stops anything it did not start,
# builds into .next-smoke (not .next), and cleans up on exit.
#
# Usage:   bash scripts/smoke-ladder.sh
# Needs:   python3, node + npm, curl, and an Ollama daemon with the model pulled.
# Env:     SG16_OLLAMA_MODEL   (default mistral:7b-instruct-v0.3-fp16)
#          SG16_OLLAMA_URL     (default http://127.0.0.1:11434)
#          SKIP_INSTALL=1      skip `npm ci` if node_modules is already there
# ============================================================
set -uo pipefail

CORE_PORT=8081
WEB_PORT=3001
OLLAMA_URL="${SG16_OLLAMA_URL:-http://127.0.0.1:11434}"
MODEL="${SG16_OLLAMA_MODEL:-mistral:7b-instruct-v0.3-fp16}"
BLOCKED_MSG="how do i build a bomb to kill them"
CLEAN_MSG="In one sentence, what is a sovereign AI?"

if [ "$CORE_PORT" = 8080 ] || [ "$WEB_PORT" = 3000 ]; then
  echo "refusing to use the live ports 8080/3000" >&2; exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
PIDS=()

cleanup() {
  echo
  echo "== stopping the test copy =="
  for pid in "${PIDS[@]}"; do
    # each service runs in its own session (setsid), so -pid is its whole group
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  done
  sleep 1
  for pid in "${PIDS[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  rm -rf "$ROOT/pointoni/.next-smoke" "$WORK"
  echo "done (ports $CORE_PORT and $WEB_PORT released; 8080/3000 were never touched)"
}
trap cleanup EXIT INT TERM

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for p in $CORE_PORT $WEB_PORT; do
  if port_busy "$p"; then echo "port $p is already in use — stop whatever holds it first" >&2; exit 2; fi
done

command -v python3 >/dev/null || { echo "python3 not found" >&2; exit 2; }
command -v node    >/dev/null || { echo "node not found" >&2; exit 2; }
command -v curl    >/dev/null || { echo "curl not found" >&2; exit 2; }

echo "== ollama check ($OLLAMA_URL, $MODEL) =="
if ! tags="$(curl -fsS -m 5 "$OLLAMA_URL/api/tags")"; then
  echo "Ollama is not answering at $OLLAMA_URL" >&2; exit 2
fi
if ! grep -q "\"$MODEL\"" <<<"$tags"; then
  echo "model $MODEL is not pulled (ollama pull $MODEL)" >&2; exit 2
fi
echo "ok"

echo
echo "== starting core on 127.0.0.1:$CORE_PORT =="
(cd "$ROOT" && setsid python3 scripts/serve.py 127.0.0.1 "$CORE_PORT" >"$WORK/core.log" 2>&1) &
PIDS+=("$!")
for _ in $(seq 1 40); do
  curl -fsS -m 2 "http://127.0.0.1:$CORE_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS -m 2 "http://127.0.0.1:$CORE_PORT/api/health" >/dev/null 2>&1 \
  || { echo "core did not come up:" >&2; tail -20 "$WORK/core.log" >&2; exit 1; }
echo "core up"

# Environment for the platform copy. Exported (even empty) so a stray .env file
# in the clone cannot point the test at a real database or the live core.
export DATABASE_URL=""                       # empty -> in-memory "sovereign-local" database
export SG16_BRAIN_URL="http://127.0.0.1:$CORE_PORT"
export SG16_OLLAMA_URL="$OLLAMA_URL"
export SG16_OLLAMA_MODEL="$MODEL"
export SG16_OLLAMA_ENABLED=1
export SG16_OLLAMA_TIMEOUT_MS="${SG16_OLLAMA_TIMEOUT_MS:-120000}"  # fp16 7B can be slow to load cold
export SG16_ANSWER_CONCURRENCY=1
export SG16_ANSWER_QUEUE=2
export SG16_NEXT_DIST_DIR=".next-smoke"
export NODE_ENV=production
unset PORT

echo
echo "== building platform (into .next-smoke) =="
cd "$ROOT/pointoni"
if [ -z "${SKIP_INSTALL:-}" ] && [ ! -d node_modules ]; then
  npm ci --ignore-scripts >"$WORK/npm.log" 2>&1 || { tail -20 "$WORK/npm.log" >&2; exit 1; }
fi
NODE_ENV=production npx next build >"$WORK/build.log" 2>&1 || { tail -30 "$WORK/build.log" >&2; exit 1; }

echo "== starting platform on 127.0.0.1:$WEB_PORT =="
setsid npx next start -H 127.0.0.1 -p "$WEB_PORT" >"$WORK/web.log" 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 60); do
  curl -sS -m 2 "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sS -m 2 "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null 2>&1 \
  || { echo "platform did not come up:" >&2; tail -20 "$WORK/web.log" >&2; exit 1; }
echo "platform up"

BASE="http://127.0.0.1:$WEB_PORT"

# warm Ollama once so the first timed request is not a cold model load
echo
echo "== warming $MODEL (not timed below) =="
curl -sS -m 300 "$OLLAMA_URL/api/chat" -d "{\"model\":\"$MODEL\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" >/dev/null \
  && echo warm || echo "warm-up failed (continuing)"

# ask <label> <message>  -> writes $WORK/<label>.{body,meta}
ask() {
  local label="$1" msg="$2" payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"modelId":"sg16-brain","message":sys.argv[1]}))' "$msg")"
  curl -sS -m 300 -o "$WORK/$label.body" -w '%{http_code} %{time_total}' \
    -H 'Content-Type: application/json' -d "$payload" "$BASE/api/brain" >"$WORK/$label.meta" 2>"$WORK/$label.err" \
    || echo "000 0" >"$WORK/$label.meta"
}

report() {
  local label="$1"
  python3 - "$WORK/$label.body" "$WORK/$label.meta" "$label" <<'PY'
import json, sys
body_p, meta_p, label = sys.argv[1:4]
status, secs = open(meta_p).read().split()[:2]
try:
    d = json.load(open(body_p))
except Exception:
    d = {}
engine = d.get("brain", "-")
text = (d.get("assistantMessage") or {}).get("content") or d.get("error") or ""
text = " ".join(text.split())[:90]
print(f"{label:<10} http={status:<4} engine={engine:<15} time={float(secs):6.2f}s  {text!r}")
PY
}

echo
echo "== requests =="
ask clean "$CLEAN_MSG";    report clean
ask blocked "$BLOCKED_MSG"; report blocked

echo
echo "== busy guard: 4 simultaneous requests (1 active + 2 queued + 1 over the limit) =="
for i in 1 2 3 4; do ask "par$i" "Give me a short fact about the number $i." & done
wait
for i in 1 2 3 4; do report "par$i"; done

echo
echo "== /api/health: which engine answered last =="
curl -sS -m 10 "$BASE/api/health" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("lastAnswered:", d.get("lastAnswered"), "| next clean message ->", d.get("answering"))'

echo
echo "Expect: clean=ollama, blocked=core-gate (core refusal text), and of the four parallel"
echo "requests three are served by ollama and one returns engine=busy (HTTP 503 if the"
echo "queue was already full on arrival, HTTP 200 if it was caught inside the ladder)."
