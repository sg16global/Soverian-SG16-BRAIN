#!/usr/bin/env bash
# =============================================================================
# SG16 BRAIN — inference-only VPS setup (run ON the 24 GB VPS, as root).
#
#   MODE=ollama   (default)  install/reuse Ollama, pull devstral (Q4_K_M ~14 GB)
#   MODE=llamacpp            llama.cpp server + Devstral Small Q4_K_M GGUF
#
# What this script does:
#   1. binds the model server to 127.0.0.1 ONLY (never a public port)
#   2. installs cloudflared and creates the tunnel model.internal.mistrelbrain.com
#      (mistralbrain.com) -> http://127.0.0.1:$MODEL_PORT
#   3. prints the exact Cloudflare Access + Worker secret steps you must run
#
# Context cap is enforced twice: OLLAMA_CONTEXT_LENGTH=8192 here, and
# options.num_ctx=8192 in every Worker request. Never load Q6 or higher.
#
# NOTE: the old stack (sg16-core) currently uses 127.0.0.1:8080. Until the
# cutover retires it, run this with MODEL_PORT=8081 and set the same value in
# the Worker's MODEL_URL tunnel ingress. After cutover you may use 8080.
# =============================================================================
set -euo pipefail

MODE="${MODE:-ollama}"
MODEL_PORT="${MODEL_PORT:-8081}"
DOMAIN_INTERNAL="${DOMAIN_INTERNAL:-model.internal.mistralbrain.com}"
TUNNEL_NAME="${TUNNEL_NAME:-sg16-model}"
CTX="${CTX:-8192}"

say()  { echo "[vps-setup] $*"; }
die()  { echo "[vps-setup] ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"
free -m | awk 'NR==2{ if ($2 < 20000) exit 1 }' || die "this box needs ~24 GB RAM for Q4_K_M + 8K KV cache"

if ss -ltn "sport = :$MODEL_PORT" | grep -q LISTEN; then
  die "port $MODEL_PORT already in use — pick another MODEL_PORT"
fi

# ---- 1. model server --------------------------------------------------------
if [ "$MODE" = "ollama" ]; then
  command -v ollama >/dev/null 2>&1 || curl -fsSL https://ollama.com/install.sh | sh
  mkdir -p /etc/systemd/system/ollama.service.d
  cat > /etc/systemd/system/ollama.service.d/10-sg16.conf <<UNIT
[Service]
Environment="OLLAMA_HOST=127.0.0.1:$MODEL_PORT"
Environment="OLLAMA_CONTEXT_LENGTH=$CTX"
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
UNIT
  systemctl daemon-reload && systemctl enable --now ollama
  say "pulling devstral (Q4_K_M, ~14 GB) — this takes a while"
  ollama pull devstral            # official tag is Q4_K_M
  ollama show devstral >/dev/null || die "model did not load"
  say "model server: ollama on 127.0.0.1:$MODEL_PORT, ctx $CTX, provider /api/chat"
else
  apt-get update && apt-get install -y git build-essential cmake curl
  mkdir -p /opt/sg16-model && cd /opt/sg16-model
  [ -d llama.cpp ] || git clone --depth 1 https://github.com/ggml-org/llama.cpp
  cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF
  cmake --build llama.cpp/build --config Release -j"$(nproc)"
  say "downloading Devstral-Small-2507 Q4_K_M GGUF (~14 GB)"
  mkdir -p models
  curl -fL -o models/devstral-small-q4km.gguf \
    "https://huggingface.co/mistralai/Devstral-Small-2507-GGUF/resolve/main/Devstral-Small-2507-Q4_K_M.gguf"
  cat > /etc/systemd/system/sg16-model.service <<UNIT
[Unit]
Description=SG16 inference-only model server (llama.cpp)
After=network.target

[Service]
ExecStart=/opt/sg16-model/llama.cpp/build/bin/llama-server \
  -m /opt/sg16-model/models/devstral-small-q4km.gguf \
  --host 127.0.0.1 --port $MODEL_PORT -c $CTX -ngl 0 --parallel 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload && systemctl enable --now sg16-model
  say "model server: llama-server on 127.0.0.1:$MODEL_PORT, ctx $CTX"
fi

# ---- 2. cloudflare tunnel ---------------------------------------------------
command -v cloudflared >/dev/null 2>&1 || {
  arch="$(dpkg --print-architecture)"
  curl -fL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb" -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb
}
cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME" || cloudflared tunnel create "$TUNNEL_NAME"

TUNNEL_ID="$(cloudflared tunnel list -o json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
[ -n "$TUNNEL_ID" ] || die "could not read tunnel id"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN_INTERNAL" 2>/dev/null || true

mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $DOMAIN_INTERNAL
    service: http://127.0.0.1:$MODEL_PORT
  - service: http_status:404
EOF
cloudflared service install "$TUNNEL_ID"
systemctl enable --now cloudflared
systemctl restart cloudflared

# ---- 3. local loop: prove the model answers before anything else -------------
sleep 3
if [ "$MODE" = "ollama" ]; then
  curl -s "http://127.0.0.1:$MODEL_PORT/api/chat" -d '{"model":"devstral","messages":[{"role":"user","content":"ping"}],"stream":false,"options":{"num_ctx":8192}}' \
    | grep -q '"message"' && say "local inference OK" || die "local inference failed"
fi

cat <<NEXT

[vps-setup] DONE on the VPS. Now do these, in order, from your PC / dashboard:

 1. Cloudflare Zero Trust -> Access -> Applications: add a self-hosted app for
      $DOMAIN_INTERNAL
    policy: deny all, EXCEPT a Service Token. Note the Client ID + Secret.
 2. Generate the tunnel shared secret (one long random string).
 3. Deploy the Worker (see brain-core/README.md), then set secrets:
      cd brain-core
      npx wrangler secret put CF_ACCESS_CLIENT_ID
      npx wrangler secret put CF_ACCESS_CLIENT_SECRET
      npx wrangler secret put MODEL_SHARED_SECRET
      npx wrangler secret put MISTRAL_API_KEY        # ONLY backup route
 4. Point MODEL_URL at the tunnel hostname (default in wrangler.jsonc):
      https://$DOMAIN_INTERNAL
 5. Zero open ports: after the cutover retires the old stack, run
      ufw default deny incoming && ufw allow outgoing && ufw enable
    and move SSH behind the tunnel (cloudflared access ssh) — see
    docs/BRAIN-CORE-REBUILD.md, "Zero open ports".

NEXT
