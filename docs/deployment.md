# Deploying SG16 BRAIN to mistralbrain.com

The host is a single self-contained Python process with **zero third-party
dependencies**, so deployment is either "put the directory on a machine and run
it" (air-gapped) or "put it behind a TLS reverse proxy" (online). Both run the
same mathematics.

## Online (mistralbrain.com)

```nginx
server {
    listen 443 ssl http2;
    server_name mistralbrain.com www.mistralbrain.com;

    ssl_certificate     /etc/letsencrypt/live/mistralbrain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mistralbrain.com/privkey.pem;

    # the sovereign host
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
        client_max_body_size 4m;   # matches config/brain.json max_body_bytes
    }
}
```

Run it as a service:

```ini
# /etc/systemd/system/sg16brain.service
[Unit]
Description=SG16 BRAIN sovereign host
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/Soverian-SG16-BRAIN
Environment=SG16_TRANSPORT=online
ExecStart=/usr/bin/python3 -m sg16.server 127.0.0.1 8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now sg16brain
certbot --nginx -d mistralbrain.com -d www.mistralbrain.com
```

## Air-gapped (offline)

```bash
SG16_TRANSPORT=offline python3 -m sg16.server 0.0.0.0 8080
```

No DNS, no certificate and no proxy are required. The transport label is
*declared, never probed*, and it never enters the mathematics: `GET /api/parity`
still returns byte-identical reasoning plans.

## Verifying a deployment

```bash
curl -s https://mistralbrain.com/api/health        # status: ready
curl -s https://mistralbrain.com/api/parity        # identical: true
curl -s -X POST https://mistralbrain.com/api/ingest \
     -H 'Content-Type: application/json' \
     -d '{"text":"hello","session_id":"smoke"}'
# -> reply: "Share your idea first."
```

## Tuning the gate

`config/brain.json` → `gate.threshold` (joint-risk cutoff) and `gate.veto_level`
(per-category saturation). Lower threshold = stricter door. The charter wording is
not configurable; it lives in `sg16/charter.py` and is asserted verbatim by tests.
