#!/usr/bin/env bash
# ============================================================
# SG16 SOVEREIGN VPS KIT — one command, full brain on your own host
# Target: fresh Ubuntu 22.04/24.04 (Debian 11+ also fine)
# Run on the VPS itself as a sudo user:
#   curl -fsSL https://raw.githubusercontent.com/sg16global/Soverian-SG16-BRAIN/<branch>/scripts/vps-setup.sh | sudo bash -s -- YOURDOMAIN.com
#   → or: sudo bash scripts/vps-setup.sh YOURDOMAIN.com
# It installs Node 20 + Python, clones the brain, builds pointoni,
# launches core (:8080) + platform (:3000) under systemd, and (if a
# domain is passed) puts Caddy in front with automatic HTTPS.
# NO secrets are asked or echoed. .env is created empty for the owner.
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"                 # optional: e.g. mistralbrain.com
REPO="https://github.com/sg16global/Soverian-SG16-BRAIN.git"
BRANCH="${SG16_BRANCH:-arena/Pointoni-red-themed-full-system}"   # override with SG16_BRANCH
APP=/opt/sg16
CORE_PORT=8080
WEB_PORT=3000

echo "== SG16 VPS KIT :: (1/7) system bones =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git python3 python3-venv python3-pip ufw >/dev/null

if ! command -v node >/dev/null || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  echo "== (2/7) Node.js 20 =="
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
else
  echo "== (2/7) Node.js already $(node -v) =="
fi

echo "== (3/7) brain tissue: clone/pull =="
mkdir -p "$APP"
if [ ! -d "$APP/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
else
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" checkout "$BRANCH" && git -C "$APP" pull --ff-only
fi

echo "== (4/7) python core (sg16 runtime) =="
python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install -q --upgrade pip
[ -f "$APP/requirements.txt" ] && "$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt" || true

echo "== (5/7) platform build (transformers.js ignores native GPU tarball) =="
cd "$APP/pointoni"
npm install --ignore-scripts --no-audit --no-fund
npm run sync-onnx
npx next build

echo "== (6/7) engines under systemd =="
cat > /etc/systemd/system/sg16-core.service <<UNIT
[Unit]
Description=SG16 Core Brain (sg16 python runtime)
After=network.target
[Service]
WorkingDirectory=$APP
ExecStart=$APP/.venv/bin/python $APP/scripts/serve.py 0.0.0.0 $CORE_PORT
Restart=always
RestartSec=5
Environment=SG16_TRANSPORT=online
[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/sg16-web.service <<UNIT
[Unit]
Description=SG16 Platform (pointoni/next)
After=network.target sg16-core.service
[Service]
WorkingDirectory=$APP/pointoni
ExecStart=/usr/bin/npx next start -p $WEB_PORT -H 0.0.0.0
Restart=always
RestartSec=5
EnvironmentFile=-$APP/.env
[Install]
WantedBy=multi-user.target
UNIT

# .env owned by root, never printed; owner fills SG16_IDENTITY_SECRET etc.
[ -f "$APP/.env" ] || { install -m 600 /dev/null "$APP/.env"; cat > "$APP/.env" <<EOF
# SG16 platform secrets — owner fills these on the VPS (never in chat, never in git)
SG16_IDENTITY_SECRET=change-me-$(date +%s)
SG16_CORE_URL=http://127.0.0.1:$CORE_PORT
EOF
}

systemctl daemon-reload
systemctl enable --now sg16-core sg16-web

if [ -n "$DOMAIN" ]; then
  echo "== (7/7) Caddy front door + auto-HTTPS for $DOMAIN =="
  if ! command -v caddy >/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
  cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:$WEB_PORT
}
CADDY
  systemctl reload caddy || systemctl restart caddy
fi

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80,443/tcp >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

echo
echo "============================================================"
echo " SG16 BRAIN LIVES ON ${DOMAIN:-http://<vps-ip>:$WEB_PORT}"
echo " core  : systemctl status sg16-core   (port $CORE_PORT)"
echo " web   : systemctl status sg16-web    (port $WEB_PORT)"
echo " logs  : journalctl -u sg16-core -f   |   -u sg16-web -f"
echo " next  : edit $APP/.env (SG16_IDENTITY_SECRET), then"
echo "         systemctl restart sg16-web"
echo " NO SECRETS WERE ASKED OR PRINTED — that is by law."
echo "============================================================"
