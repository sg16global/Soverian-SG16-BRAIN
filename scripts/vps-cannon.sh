#!/usr/bin/env bash
# ============================================================
# SG16 VPS CANNON — fire the whole platform onto a fresh host
#
# scripts/vps-setup.sh builds the *brain* (core + platform under systemd,
# Caddy in front). The cannon wraps it and adds the two pieces that make a
# host feel like home rather than a demo:
#
#   1. the Ollama heart-bridge — the platform keeps answering even when the
#      Q16.16 core is down, from the operator's own metal;
#   2. the children's body — the static Children's Friend, served from
#      /srv/sg16children, ready for its own domain.
#
# Nothing here asks for, echoes or stores a secret. .env is created empty.
#
# Usage (on the VPS, as a sudo user):
#   sudo bash scripts/vps-cannon.sh mistralbrain.com [sg16children.com]
#   SG16_BRANCH=main sudo bash scripts/vps-cannon.sh mistralbrain.com
#   SKIP_OLLAMA=1 sudo bash scripts/vps-cannon.sh mistralbrain.com
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
CHILD_DOMAIN="${2:-}"
CHILD_ROOT=/srv/sg16children
OLLAMA_MODEL="${SG16_OLLAMA_MODEL:-mistral}"

echo "=============================================="
echo " SG16 VPS CANNON"
echo " flagship : ${DOMAIN:-<none — local only>}"
echo " children : ${CHILD_DOMAIN:-<not configured>}"
echo " heart    : ${SKIP_OLLAMA:+disabled}${SKIP_OLLAMA:-ollama ${OLLAMA_MODEL}}"
echo "=============================================="

# ── 1/4 the brain itself (existing kit, unchanged) ───────────────────────────
echo
echo "== (1/4) brain kit =="
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vps-setup.sh"
if [ -f "$KIT" ]; then
  bash "$KIT" "$DOMAIN"
else
  echo "!! vps-setup.sh not found next to this script — aborting"
  exit 1
fi

APP=/opt/sg16
[ -d "$APP" ] || { echo "!! expected the kit to land in $APP"; exit 1; }

# ── 2/4 the heart-bridge (local Ollama) ──────────────────────────────────────
echo
echo "== (2/4) heart-bridge =="
if [ -n "${SKIP_OLLAMA:-}" ]; then
  echo "   skipped (SKIP_OLLAMA set)"
elif command -v ollama >/dev/null; then
  echo "   ollama already installed: $(ollama --version 2>/dev/null | head -1)"
else
  echo "   installing ollama (official installer, no secrets involved)"
  if curl -fsSL https://ollama.com/install.sh | sh >/dev/null 2>&1; then
    echo "   ollama installed"
  else
    echo "   !! ollama install failed — the brain still runs; the bridge stays inert"
  fi
fi

if command -v ollama >/dev/null; then
  systemctl enable --now ollama >/dev/null 2>&1 || true
  echo "   pulling ${OLLAMA_MODEL} (large download; one time per host)"
  ollama pull "$OLLAMA_MODEL" || echo "   !! pull failed — run 'ollama pull ${OLLAMA_MODEL}' later"
fi

# write the bridge vars into the platform env WITHOUT printing any secret
ENV_FILE="$APP/pointoni/.env"
touch "$ENV_FILE"
if ! grep -q '^SG16_OLLAMA_URL=' "$ENV_FILE" 2>/dev/null; then
  {
    echo ""
    echo "# --- SG16 heart-bridge (added by vps-cannon.sh) ---"
    echo "SG16_OLLAMA_URL=http://127.0.0.1:11434"
    echo "SG16_OLLAMA_MODEL=${OLLAMA_MODEL}"
    echo "SG16_OLLAMA_TIMEOUT_MS=45000"
  } >> "$ENV_FILE"
  echo "   bridge configured in $ENV_FILE"
else
  echo "   bridge already configured in $ENV_FILE"
fi

# ── 3/4 the children's body (static, no build) ───────────────────────────────
echo
echo "== (3/4) children's body =="
if [ -f "$APP/children/index.html" ]; then
  mkdir -p "$CHILD_ROOT"
  cp -r "$APP/children/." "$CHILD_ROOT/"
  echo "   deployed to $CHILD_ROOT ($(du -sh "$CHILD_ROOT" | cut -f1))"
  if [ -n "$CHILD_DOMAIN" ]; then
    # the body must be allowed to call the power plant cross-origin
    if ! grep -q '^SG16_CHILDREN_ORIGINS=' "$ENV_FILE" 2>/dev/null; then
      echo "SG16_CHILDREN_ORIGINS=https://${CHILD_DOMAIN},https://www.${CHILD_DOMAIN}" >> "$ENV_FILE"
      echo "   CORS children lock allows https://${CHILD_DOMAIN}"
    fi
    echo "   point ${CHILD_DOMAIN} at ${CHILD_ROOT} in your Caddy block, then reload caddy"
  else
    echo "   no children domain passed — body staged only"
  fi
else
  echo "   children/ not present in this checkout — skipped"
fi

# ── 4/4 restart + report honestly ────────────────────────────────────────────
echo
echo "== (4/4) restart + verdict =="
systemctl restart sg16-core sg16-platform >/dev/null 2>&1 || \
  systemctl restart sg16-core >/dev/null 2>&1 || true

sleep 2
echo "   services:"
systemctl is-active sg16-core >/dev/null 2>&1 && echo "     sg16-core     active" || echo "     sg16-core     NOT active"
systemctl is-active sg16-platform >/dev/null 2>&1 && echo "     sg16-platform active" || echo "     sg16-platform NOT active"
systemctl is-active ollama >/dev/null 2>&1 && echo "     ollama        active" || echo "     ollama        not active (bridge inert)"

CORE_UP=no
curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1 && CORE_UP=yes
echo "   core health   : $CORE_UP"
if [ "$CORE_UP" = yes ]; then
  echo "   answering     : core (Q16.16)"
elif systemctl is-active ollama >/dev/null 2>&1; then
  echo "   answering     : ollama heart-bridge (core still coming up)"
else
  echo "   answering     : local guard channel"
fi

echo
echo "== CANNON DONE =="
if [ -n "$DOMAIN" ]; then
  echo "verify:  curl -s https://${DOMAIN}/api/health | head -c 400"
fi
echo "the platform reports which engine answered every turn — never a claim it cannot back."
