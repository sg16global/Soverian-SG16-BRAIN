#!/usr/bin/env bash
# =============================================================================
# SG16 BRAIN — inference-only VPS setup (run ON the 24 GB VPS, as root).
#
#   MODE=ollama   (default)  install/upgrade Ollama, pull BOTH brains at full
#                            true weights (fp16): chat + coding
#   MODE=llamacpp            llama.cpp servers (one per brain) + fp16 GGUFs
#
# The two brains (owner decision 2026-10-19 — speed is priority, CPU-only box):
#   chat brain : ministral-3:3b-instruct-2512-fp16    (~7.7 GB, full true weights)
#   coding     : qwen2.5-coder:3b-instruct-fp16      (~6.2 GB, full true weights)
# Both are small enough to stay loaded at once (OLLAMA_MAX_LOADED_MODELS=2).
# The old brain (devstral, Q4_K_M ~14 GB) is REMOVED by this script.
#
# What this script does:
#   1. binds the model server(s) to 127.0.0.1 ONLY (never a public port)
#   2. installs cloudflared and creates the tunnel model.internal.mistrelbrain.com
#      (mistralbrain.com) -> http://127.0.0.1:$MODEL_PORT
#      (a second hostname coder.internal... is routed too — llamacpp mode maps
#      it to the coding server's port; Ollama mode maps it to the same server)
#   3. prints the exact Cloudflare Access + Worker secret steps you must run
#
# Context cap is enforced twice: OLLAMA_CONTEXT_LENGTH=8192 here, and
# options.num_ctx=8192 in every Worker request.
# KEEP_ALIVE stays a finite default (30m) — NEVER -1 (never pin models forever).
#
# NOTE: the old stack (sg16-core) currently uses 127.0.0.1:8080. Until the
# cutover retires it, run this with MODEL_PORT=8081 and set the same value in
# the Worker's MODEL_URL tunnel ingress. After cutover you may use 8080.
# =============================================================================
set -euo pipefail

MODE="${MODE:-ollama}"
MODEL_PORT="${MODEL_PORT:-8081}"
CODER_PORT="${CODER_PORT:-$((MODEL_PORT + 1))}"
DOMAIN_INTERNAL="${DOMAIN_INTERNAL:-model.internal.mistralbrain.com}"
DOMAIN_CODER_INTERNAL="${DOMAIN_CODER_INTERNAL:-coder.internal.mistralbrain.com}"
TUNNEL_NAME="${TUNNEL_NAME:-sg16-model}"
CTX="${CTX:-8192}"
# Full true weights (fp16) — the owner's weights principle: every AI core is
# mathematical, so the true weights are preferred. Both models are small
# enough to stay resident on the 24 GB box.
MODEL_CHAT="${MODEL_CHAT:-ministral-3:3b-instruct-2512-fp16}"
MODEL_CODER="${MODEL_CODER:-qwen2.5-coder:3b-instruct-fp16}"
GGUF_CHAT_URL="${GGUF_CHAT_URL:-https://huggingface.co/unsloth/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-F16.gguf}"
GGUF_CODER_URL="${GGUF_CODER_URL:-https://huggingface.co/unsloth/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-3B-Instruct-F16.gguf}"
OLD_MODEL="${OLD_MODEL:-devstral}"   # the old brain — removed after the swap

say()  { echo "[vps-setup] $*"; }
die()  { echo "[vps-setup] ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"
free -m | awk 'NR==2{ if ($2 < 20000) exit 1 }' || die "this box needs ~24 GB RAM for two fp16 3B brains + 8K KV caches"

if ss -ltn "sport = :$MODEL_PORT" | grep -q LISTEN; then
  die "port $MODEL_PORT already in use — pick another MODEL_PORT"
fi
if [ "$MODE" = "llamacpp" ] && ss -ltn "sport = :$CODER_PORT" | grep -q LISTEN; then
  die "port $CODER_PORT already in use — pick another CODER_PORT"
fi

# ---- 1. model server(s) -----------------------------------------------------
if [ "$MODE" = "ollama" ]; then
  # always (re)run the installer: it upgrades in place, and the mistral3
  # architecture needs a recent Ollama
  curl -fsSL https://ollama.com/install.sh | sh
  mkdir -p /etc/systemd/system/ollama.service.d
  cat > /etc/systemd/system/ollama.service.d/10-sg16.conf <<UNIT
[Service]
Environment="OLLAMA_HOST=127.0.0.1:$MODEL_PORT"
Environment="OLLAMA_CONTEXT_LENGTH=$CTX"
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
UNIT
  systemctl daemon-reload && systemctl enable --now ollama
  say "pulling the chat brain: $MODEL_CHAT (~7.7 GB fp16) — this takes a while"
  ollama pull "$MODEL_CHAT"
  say "pulling the coding brain: $MODEL_CODER (~6.2 GB fp16) — this takes a while"
  ollama pull "$MODEL_CODER"
  ollama show "$MODEL_CHAT" >/dev/null || die "chat brain did not load"
  ollama show "$MODEL_CODER" >/dev/null || die "coding brain did not load"
  say "model server: ollama on 127.0.0.1:$MODEL_PORT, ctx $CTX, both brains resident, provider /api/chat"
else
  apt-get update && apt-get install -y git build-essential cmake curl
  mkdir -p /opt/sg16-model && cd /opt/sg16-model
  [ -d llama.cpp ] || git clone --depth 1 https://github.com/ggml-org/llama.cpp
  cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF
  cmake --build llama.cpp/build --config Release -j"$(nproc)"
  say "downloading the chat brain GGUF (fp16, ~7.7 GB)"
  mkdir -p models
  curl -fL -o models/chat-fp16.gguf "$GGUF_CHAT_URL"
  say "downloading the coding brain GGUF (fp16, ~6.2 GB)"
  curl -fL -o models/coder-fp16.gguf "$GGUF_CODER_URL"
  rm -f models/devstral-small-q4km.gguf   # the old brain
  cat > /etc/systemd/system/sg16-model-chat.service <<UNIT
[Unit]
Description=SG16 inference-only model server (chat brain)
After=network.target

[Service]
ExecStart=/opt/sg16-model/llama.cpp/build/bin/llama-server \
  -m /opt/sg16-model/models/chat-fp16.gguf \
  --host 127.0.0.1 --port $MODEL_PORT -c $CTX -ngl 0 --parallel 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  cat > /etc/systemd/system/sg16-model-coder.service <<UNIT
[Unit]
Description=SG16 inference-only model server (coding brain)
After=network.target

[Service]
ExecStart=/opt/sg16-model/llama.cpp/build/bin/llama-server \
  -m /opt/sg16-model/models/coder-fp16.gguf \
  --host 127.0.0.1 --port $CODER_PORT -c $CTX -ngl 0 --parallel 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload && systemctl enable --now sg16-model-chat sg16-model-coder
  say "model servers: llama-server chat on 127.0.0.1:$MODEL_PORT, coder on 127.0.0.1:$CODER_PORT, ctx $CTX"
fi

# ---- 2. remove the old brain (frees ~14 GB) ---------------------------------
if [ "$MODE" = "ollama" ] && ollama show "$OLD_MODEL" >/dev/null 2>&1; then
  say "removing the old brain: $OLD_MODEL"
  ollama rm "$OLD_MODEL"
  say "old brain removed. The live Worker still points at it until you deploy
       the Worker update — push right after this script finishes."
fi

# ---- 3. cloudflare tunnel ---------------------------------------------------
command -v cloudflared >/dev/null 2>&1 || {
  arch="$(dpkg --print-architecture)"
  curl -fL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb" -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb
}
cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME" || cloudflared tunnel create "$TUNNEL_NAME"

TUNNEL_ID="$(cloudflared tunnel list -o json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
[ -n "$TUNNEL_ID" ] || die "could not read tunnel id"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN_INTERNAL" 2>/dev/null || true
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN_CODER_INTERNAL" 2>/dev/null || true

# Ollama serves both brains on one port; llamacpp runs one server per brain.
CODER_INGRESS_PORT="$MODEL_PORT"
if [ "$MODE" = "llamacpp" ]; then CODER_INGRESS_PORT="$CODER_PORT"; fi

mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $DOMAIN_INTERNAL
    service: http://127.0.0.1:$MODEL_PORT
  - hostname: $DOMAIN_CODER_INTERNAL
    service: http://127.0.0.1:$CODER_INGRESS_PORT
  - service: http_status:404
EOF
cloudflared service install "$TUNNEL_ID"
systemctl enable --now cloudflared
systemctl restart cloudflared

# ---- 4. local loop: prove the brains answer before anything else ------------
sleep 3
if [ "$MODE" = "ollama" ]; then
  curl -s "http://127.0.0.1:$MODEL_PORT/api/chat" -d "{\"model\":\"$MODEL_CHAT\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"stream\":false,\"options\":{\"num_ctx\":8192}}" \
    | grep -q '"message"' && say "local inference OK (chat brain)" || die "local inference failed"
else
  curl -s "http://127.0.0.1:$MODEL_PORT/health" | grep -q '"status":"ok"' \
    && say "chat server OK" || die "chat server failed"
  curl -s "http://127.0.0.1:$CODER_PORT/health" | grep -q '"status":"ok"' \
    && say "coder server OK" || die "coder server failed"
fi

cat <<NEXT

[vps-setup] DONE on the VPS. Now do these, in order, from your PC / dashboard:

 1. Cloudflare Zero Trust -> Access -> Applications: add a self-hosted app for
      $DOMAIN_INTERNAL
    policy: deny all, EXCEPT a Service Token. Note the Client ID + Secret.
    (MODE=llamacpp only: add the same app for $DOMAIN_CODER_INTERNAL.)
 2. Generate the tunnel shared secret (one long random string).
 3. Deploy the Worker (see brain-core/README.md), then set secrets:
      cd brain-core
      npx wrangler secret put CF_ACCESS_CLIENT_ID
      npx wrangler secret put CF_ACCESS_CLIENT_SECRET
      npx wrangler secret put MODEL_SHARED_SECRET
    There is NO third-party AI API secret — no backup route exists in this
    system. If the VPS is down, chat fails honestly with 502.
 4. Point MODEL_URL at the tunnel hostname (default in wrangler.jsonc):
      https://$DOMAIN_INTERNAL
    Keep wrangler.jsonc in sync with the pulls above:
      MODEL_NAME       = $MODEL_CHAT
      MODEL_NAME_CODER = $MODEL_CODER
    (MODE=llamacpp only: also set MODEL_URL_CODER to https://$DOMAIN_CODER_INTERNAL)
 5. Swap order: this script already removed the old brain ($OLD_MODEL), so
    push the Worker update NOW — until it deploys, chat returns 502.
 6. Zero open ports: after the cutover retires the old stack, run
      ufw default deny incoming && ufw allow outgoing && ufw enable
    and move SSH behind the tunnel (cloudflared access ssh) — see
    docs/BRAIN-CORE-REBUILD.md, "Zero open ports".

NEXT
