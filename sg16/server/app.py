"""SG16 BRAIN - HTTP host for the sealed perimeter.

Standard library only (``http.server``), so the sovereign build keeps its
zero-dependency property and can be dropped onto an air-gapped machine as a
single directory.

Routes
------
    GET    /                        interface
    GET    /static/<file>           css / js / svg
    GET    /api/health              readiness, digests, topology
    GET    /api/charter             the seven invariants and canonical lines
    GET    /api/topology            perimeter, door counters, joint room
    GET    /api/parity              online/offline reasoning-parity proof
    GET    /api/knowledge           knowledge base manifest
    GET    /api/session/<id>        session state
    DELETE /api/session/<id>        forget a session
    GET    /api/weight?member=&feature=   charter provenance of one weight
    POST   /api/ingest              one payload through the master door
    POST   /api/audio               audio bytes through the master door
    POST   /api/introspect          full gate + retrieval breakdown
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import posixpath
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .. import billing
from ..brain import SG16Brain
from ..charter import CANON, CHARTER, GATE_TITLES
from ..config import BrainConfig
from .throttle import Throttle, ThrottleExceeded

__all__ = ["BrainHTTPServer", "BrainRequestHandler", "build_server", "main"]

# The UI lives in web/ (Vite source tree).  The sovereign host serves the same
# modules raw as ES modules - no bundler required - and binary assets come
# straight off this host, so delivery is a self-contained byte stream.
WEB_ROOT = Path(__file__).resolve().parent.parent.parent / "web"
SERVER_VERSION = "SG16BRAIN/1.0"

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


class BrainHTTPServer(ThreadingHTTPServer):
    """Threaded host carrying one shared brain instance."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler, brain: SG16Brain, config: BrainConfig) -> None:
        self.brain = brain
        self.config = config
        self._lock = threading.Lock()
        self.billing_secret = config.billing_secret
        self.passes: dict[str, dict] = {}
        self.throttle = Throttle(
            max_requests=config.throttle_max_requests,
            window_seconds=config.throttle_window_seconds,
            max_chars=config.throttle_max_chars,
        )
        super().__init__(address, handler)

    def submit_locked(self, *args, **kwargs):
        """Serialise entry to the master door.

        The door keeps counters and the character engine keeps session state.
        Both are plain Python objects, so the single door is guarded by a single
        lock - which also means the "one door" property holds under concurrency.
        """
        with self._lock:
            return self.brain.submit(*args, **kwargs)


class BrainRequestHandler(BaseHTTPRequestHandler):
    server_version = SERVER_VERSION
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------------
    # plumbing
    # ------------------------------------------------------------------
    @property
    def brain(self) -> SG16Brain:
        return self.server.brain  # type: ignore[attr-defined]

    @property
    def brain_config(self) -> BrainConfig:
        return self.server.config  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        # Zero client logs on the core server grid: request lines are never
        # written anywhere.  The brain holds in-memory session state only.
        return

    def _send(self, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "no-referrer")
        self._cors()
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _cors(self) -> None:
        """Reflect only allow-listed origins.  Same-origin needs no header."""
        origin = self.headers.get("Origin")
        if not origin:
            return
        allowed = self.brain_config.cors_origins
        if origin not in allowed:
            return
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Session-Id, X-Transcript")

    def _json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self._send(status, body, CONTENT_TYPES[".json"])

    def _error(self, status: int, message: str) -> None:
        self._json({"error": message, "status": status}, status=status)

    def _read_body(self) -> bytes:
        declared = int(self.headers.get("Content-Length") or 0)
        limit = self.brain_config.max_body_bytes
        if declared > limit:
            # do not let an oversized body sit on a keep-alive socket
            self.close_connection = True
            raise ValueError(f"payload exceeds the {limit} byte limit")
        return self.rfile.read(declared) if declared else b""

    # ------------------------------------------------------------------
    # verbs
    # ------------------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"", "text/plain; charset=utf-8")

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = posixpath.normpath(parsed.path)
        query = parse_qs(parsed.query)

        if route in ("/", "/index.html"):
            return self._static("index.html")
        if route == "/favicon.ico":
            return self._send(204, b"", "image/x-icon")
        if route.startswith(("/src/", "/assets/", "/public/")):
            return self._static(route.lstrip("/"))

        handlers = {
            "/api/health": self._api_health,
            "/api/charter": self._api_charter,
            "/api/topology": self._api_topology,
            "/api/parity": self._api_parity,
            "/api/knowledge": self._api_knowledge,
        }
        if route in handlers:
            return handlers[route]()

        if route == "/api/billing":
            return self._api_billing()
        if route == "/api/weight":
            return self._api_weight(query)
        if route.startswith("/api/session/"):
            return self._api_session_get(route.rsplit("/", 1)[-1])

        self._error(404, f"no such route: {route}")

    def do_POST(self) -> None:  # noqa: N802
        route = posixpath.normpath(urlparse(self.path).path)
        try:
            body = self._read_body()
        except ValueError as exc:
            return self._error(413, str(exc))

        if route == "/api/subscribe":
            return self._api_subscribe(body)
        if route == "/api/ingest":
            return self._api_ingest(body)
        if route == "/api/audio":
            return self._api_audio(body)
        if route == "/api/introspect":
            return self._api_introspect(body)
        self._error(404, f"no such route: {route}")

    def do_DELETE(self) -> None:  # noqa: N802
        route = posixpath.normpath(urlparse(self.path).path)
        if route.startswith("/api/session/"):
            session_id = route.rsplit("/", 1)[-1]
            self.brain.reset_session(session_id)
            return self._json({"forgotten": session_id})
        self._error(404, f"no such route: {route}")

    # ------------------------------------------------------------------
    # static
    # ------------------------------------------------------------------
    def _web_file(self, relative: str) -> Path | None:
        """Resolve a request path inside web/, falling back to web/public/."""
        rel = relative.lstrip("/")
        root = WEB_ROOT.resolve()
        for base in (WEB_ROOT, WEB_ROOT / "public"):
            candidate = (base / rel).resolve()
            if str(candidate).startswith(str(root)) and candidate.is_file():
                return candidate
        return None

    def _static(self, relative: str) -> None:
        candidate = self._web_file(relative)
        if candidate is None:
            return self._error(404, f"no such file: {relative}")
        content_type = CONTENT_TYPES.get(candidate.suffix, "application/octet-stream")
        # Byte-stream delivery: binary assets and module sources are cached for
        # an hour and flagged, keeping frontend delivery fast and leak-free.
        extra = {"Cache-Control": "public, max-age=3600", "X-SG16-Stream": "binary"}
        self._send(200, candidate.read_bytes(), content_type, extra)

    # ------------------------------------------------------------------
    # api
    # ------------------------------------------------------------------
    def _api_health(self) -> None:
        self._json(self.brain.health())

    def _api_charter(self) -> None:
        self._json(
            {
                "invariants": [
                    {
                        "key": inv.key,
                        "text": inv.text,
                        "severity": inv.severity,
                        "enforced_by": list(inv.affinity),
                        "weight_seed": inv.weight_seed,
                    }
                    for inv in CHARTER
                ],
                "canonical": dict(CANON),
                "joint_room": dict(GATE_TITLES),
            }
        )

    def _api_topology(self) -> None:
        self._json(
            {
                **self.brain.housing.topology(),
                "gate_weights_sha256": self.brain.panel.weights.fingerprint,
                "core_matrix_sha256": self.brain.core.matrix_sha256,
            }
        )

    def _api_parity(self) -> None:
        self._json(self.brain.parity_report())

    def _api_knowledge(self) -> None:
        self._json(
            {
                "version": self.brain.knowledge.version,
                "entries": len(self.brain.knowledge.entries),
                "topics": sorted({e.topic for e in self.brain.knowledge.entries}),
                "ids": [e.id for e in self.brain.knowledge.entries],
                "policy": "recall, compute, or defer - never fabricate",
            }
        )

    def _api_weight(self, query: dict[str, list[str]]) -> None:
        member = (query.get("member") or ["kali"])[0]
        feature = (query.get("feature") or ["harm_violence"])[0]
        if member not in GATE_TITLES:
            return self._error(400, f"unknown gate member: {member}")
        try:
            self._json(self.brain.explain_weight(member, feature))
        except ValueError as exc:
            self._error(400, str(exc))

    def _api_session_get(self, session_id: str) -> None:
        self._json(self.brain.session(session_id).to_dict())

    def _entitlement(self, payload: dict, session_id: str, size: int):
        """Resolve owner / premium status and enforce the throttles.

        Returns (is_owner, premium) or sends an error response and returns
        None.  The owner and verified pass holders are exempt from operational
        throttles; everyone else is metered.  The safety gate is unaffected.
        """
        owner_sig = self.headers.get("X-SG16-Owner-Sig") or self.headers.get("X-SG16-Owner")
        is_owner = self.brain.panel.is_owner(owner_sig)

        premium = False
        pass_token = self.headers.get("X-SG16-Pass") or payload.get("pass_token")
        if pass_token:
            record = self.server.passes.get(str(pass_token))
            if record is None:
                self._error(403, "pass token was not issued by this host")
                return None
            try:
                billing.verify_record(record, self.server.billing_secret)
                premium = True
            except billing.VerificationError as exc:
                self._error(403, f"subscription failed verification: {exc}")
                return None

        try:
            self.server.throttle.check(session_id, size, exempt=is_owner or premium)
        except ThrottleExceeded as exc:
            self._error(429, str(exc))
            return None
        return is_owner, premium

    def _api_subscribe(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        pass_id = str(payload.get("pass", ""))
        region = payload.get("region")
        try:
            record = billing.issue_record(
                pass_id,
                region,
                self.server.billing_secret,
                provider=str(payload.get("provider", "guest")),
            )
        except billing.VerificationError as exc:
            return self._error(400, str(exc))
        self.server.passes[record["token"]] = record
        self._json(record)

    def _api_billing(self) -> None:
        self._json(
            {
                "currency": "USD",
                "humanitarian_region": billing.HUMANITARIAN_REGION,
                "passes": {
                    pid: {"label": spec.label, "price": spec.price, "hours": spec.hours}
                    for pid, spec in billing.PASSES.items()
                },
                "owner_bypass": "token_accounting+throttles only; safety never",
            }
        )

    def _api_ingest(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        if not isinstance(payload, dict):
            return self._error(400, "body must be a json object")

        text = str(payload.get("text", ""))
        session_id = str(payload.get("session_id") or "default")
        audio: bytes | None = None
        if payload.get("audio_b64"):
            try:
                audio = base64.b64decode(str(payload["audio_b64"]), validate=True)
            except (binascii.Error, ValueError) as exc:
                return self._error(400, f"audio_b64 is not valid base64: {exc}")

        entitlement = self._entitlement(
            payload, session_id, len(text) + len(audio or b"")
        )
        if entitlement is None:
            return
        is_owner, premium = entitlement

        transaction = self.server.submit_locked(  # type: ignore[attr-defined]
            text,
            session_id=session_id,
            audio=audio,
            declared_transcript=payload.get("declared_transcript"),
        )
        data = transaction.to_dict()
        data["owner"] = is_owner
        data["premium"] = premium
        data["throttle"] = self.server.throttle.counters(session_id)
        self._json(data)

    def _api_audio(self, body: bytes) -> None:
        if not body:
            return self._error(400, "audio body is empty")
        session_id = self.headers.get("X-Session-Id") or "default"
        declared = self.headers.get("X-Transcript")
        transaction = self.server.submit_locked(  # type: ignore[attr-defined]
            "",
            session_id=session_id,
            audio=body,
            declared_transcript=declared,
        )
        self._json(transaction.to_dict())

    def _api_introspect(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        text = str(payload.get("text", "")) if isinstance(payload, dict) else ""
        self._json(self.brain.introspect(text))


# ----------------------------------------------------------------------
def build_server(
    config: BrainConfig | None = None,
    host: str | None = None,
    port: int | None = None,
    brain: SG16Brain | None = None,
) -> BrainHTTPServer:
    cfg = config or BrainConfig.default()
    # ``port=0`` is a legitimate request for an ephemeral port; it must not be
    # swallowed by a truthiness fallback.
    resolved_host = host if host is not None else (os.environ.get("SG16_HOST") or cfg.host)
    resolved_port = int(os.environ.get("SG16_PORT") or cfg.port) if port is None else int(port)
    instance = brain or SG16Brain(cfg)
    return BrainHTTPServer((resolved_host, resolved_port), BrainRequestHandler, instance, cfg)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    host = argv[0] if len(argv) > 0 else None
    port = int(argv[1]) if len(argv) > 1 else None

    config = BrainConfig.load(os.environ.get("SG16_CONFIG"))
    server = build_server(config, host=host, port=port)
    bound_host, bound_port = server.server_address[0], server.server_address[1]

    print(f"SG16 BRAIN v{config.version} - {config.name}")
    print(f"  domain          {config.domain}")
    print(f"  listening       http://{bound_host}:{bound_port}")
    print(f"  transport       {config.transport.value} (declared, never probed)")
    print(f"  core            {config.engine.head}  matrix={server.brain.core.matrix_sha256[:16]}")
    print(f"  gate weights    {server.brain.panel.weights.fingerprint[:16]}")
    print(f"  knowledge       {len(server.brain.knowledge.entries)} entries")
    print("  perimeter       4 sides, 1 master door, sealed")

    def shutdown(signum, _frame):  # pragma: no cover - signal path
        print(f"\n[sg16] received signal {signum}, closing the master door")
        threading.Thread(target=server.shutdown, daemon=True).start()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, shutdown)
        except ValueError:  # pragma: no cover - non-main thread
            pass

    try:
        server.serve_forever()
    finally:
        server.server_close()
        print("[sg16] host stopped")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
