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
    POST   /api/subscribe           host-signed local subscription record
    POST   /api/dodo/checkout       Dodo MoR checkout session for one pass
    POST   /api/dodo/webhook        signed Dodo payment confirmation
    POST   /api/dodo/confirm        client pickup of the confirmed record
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import posixpath
import signal
import struct
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .. import billing
from ..brain import SG16Brain
from ..charter import CANON, CHARTER, GATE_TITLES, MASTER_CHARTER, FUNDAMENTAL_ATTITUDE, OWNERSHIP_PHILOSOPHY, PERSONALITY_TRAITS
from ..config import BrainConfig
from ..engine.voxtral import EnvelopeError
from .dodo import DodoClient, DodoError
from .throttle import Throttle, ThrottleExceeded

__all__ = ["BrainHTTPServer", "BrainRequestHandler", "build_server", "main"]

# The UI lives in web/ (Vite source tree).  The sovereign host serves the same
# modules raw as ES modules - no bundler required - and binary assets come
# straight off this host, so delivery is a self-contained byte stream.
WEB_ROOT = Path(__file__).resolve().parent.parent.parent / "web"
SERVER_VERSION = "SG16BRAIN/1.0"

# Bug #2 boundary: malformed audio surfaces as any member of the container-
# parser family - our own EnvelopeError, the stdlib wave/chunk errors
# (wave.Error, EOFError, RuntimeError, OSError, ValueError - exactly what
# wave.py/chunk.py raise for broken RIFF headers) and struct unpack failures.
# These are predictable 400 validations, never dropped sockets.  The boundary
# is enforced ONLY for payloads that actually carry audio; a fault on the
# plain-text path is re-raised, never masked.
AUDIO_DECODE_ERRORS: tuple[type[Exception], ...] = (
    EnvelopeError,
    wave.Error,
    struct.error,
    EOFError,
    OSError,
    ValueError,
    RuntimeError,
)

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
    #: The socketserver default backlog of 5 resets connections under a
    #: browser's normal first-paint burst (HTML + modules + assets open in
    #: parallel), which surfaces client-side as a dropped "crash".  128 gives
    #: the accept thread headroom under real traffic.
    request_queue_size = 128

    def __init__(self, address, handler, brain: SG16Brain, config: BrainConfig) -> None:
        self.brain = brain
        self.config = config
        self._lock = threading.Lock()
        self.billing_secret = config.billing_secret
        self.passes: dict[str, dict] = {}
        #: Dodo checkout sessions created by this host, keyed by the gateway
        #: session/payment id: {"pass", "region", "status", "record_token"}.
        #: In-memory only - the host keeps zero client logs and persists
        #: nothing; the signed record itself lives on the user's device.
        self.dodo_pending: dict[str, dict] = {}
        #: The Dodo MoR client, or None when no API key is configured (the
        #: sovereign local issuance path serves checkout in that state).
        self.dodo = (
            DodoClient(
                config.dodo_api_key,
                test_mode=config.dodo_test_mode,
                api_bases=config.dodo_api_bases,
            )
            if config.dodo_api_key
            else None
        )
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
            "/api/identity": self._api_identity,
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
        if route == "/api/dodo/checkout":
            return self._api_dodo_checkout(body)
        if route == "/api/dodo/webhook":
            return self._api_dodo_webhook(body)
        if route == "/api/dodo/confirm":
            return self._api_dodo_confirm(body)
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

    def _api_identity(self) -> None:
        """Designation-protocol handshake (Block 7, rule 2).

        The brain natively states its immutable designation "SG16" and proves
        the inscription: the identity digest recomputes against the core
        matrix fingerprint with 100% certainty, or ``verified`` is false.
        """
        self._json(self.brain.identity())

    def _api_charter(self) -> None:
        def _to_dict(obj):
            if isinstance(obj, dict):
                return {k: _to_dict(v) for k, v in obj.items()}
            try:
                from types import MappingProxyType
                if isinstance(obj, MappingProxyType):
                    return {k: _to_dict(v) for k, v in obj.items()}
            except Exception:
                pass
            if isinstance(obj, (list, tuple)):
                return [_to_dict(x) for x in obj]
            return obj

        self._json(
            {
                "master_charter": _to_dict(
                    {
                        "title": MASTER_CHARTER["title"],
                        "purpose": MASTER_CHARTER["purpose"],
                        "core_identity": MASTER_CHARTER["1_core_identity"],
                        "sovereign_identity": MASTER_CHARTER["2_sovereign_identity_operational_freedom_ownership"],
                        "human_first_personality": {
                            "traits": list(PERSONALITY_TRAITS),
                            "fundamental_attitude": FUNDAMENTAL_ATTITUDE,
                            "ownership_philosophy": OWNERSHIP_PHILOSOPHY,
                        },
                        "universal_friendly": MASTER_CHARTER["4_universal_friendly_relationship"],
                        "safe_for_all_ages": MASTER_CHARTER["5_safe_for_all_ages"],
                        "child_safety_boundary": MASTER_CHARTER["6_child_safety_boundary"],
                        "extreme_harm_protection": MASTER_CHARTER["7_extreme_harm_protection"],
                        "privacy_zero_data": MASTER_CHARTER["8_privacy_zero_data"],
                        "handling_angry_users": MASTER_CHARTER["9_handling_angry_users"],
                        "universal_policy_ai_systems": MASTER_CHARTER["10_universal_policy_ai_systems"],
                        "ai_comparison_philosophy": MASTER_CHARTER["11_ai_comparison_philosophy"],
                        "future_proof_neutrality": MASTER_CHARTER["12_future_proof_neutrality"],
                        "user_first_model_selection": MASTER_CHARTER["13_user_first_model_selection"],
                        "thought_partner_mode": MASTER_CHARTER["14_thought_partner_mode"],
                        "balanced_analysis": MASTER_CHARTER["15_balanced_analysis"],
                        "solution_first_reasoning": MASTER_CHARTER["16_solution_first_reasoning"],
                        "never_create_panic": MASTER_CHARTER["17_never_create_panic"],
                        "humility_in_deliverables": MASTER_CHARTER["18_humility_in_deliverables"],
                        "intellectual_honesty": MASTER_CHARTER["19_intellectual_honesty"],
                        "no_artificial_ego": MASTER_CHARTER["20_no_artificial_ego"],
                        "response_adaptation": MASTER_CHARTER["21_response_adaptation"],
                        "permanent_behavioral_hierarchy": MASTER_CHARTER["22_permanent_behavioral_hierarchy"],
                        "system_implementation": MASTER_CHARTER["23_system_implementation"],
                        "master_character_principle": MASTER_CHARTER["master_character_principle"],
                    }
                ),
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

    def _resolve_region(self, payload: dict) -> str | None:
        """Geographic interceptor on the routing path (item 5).

        Declared payload region first, then the ``X-SG16-Region`` header, then
        edge geo headers (``CF-IPCountry`` / ``X-Vercel-IP-Country``).  A
        Palestine mapping at any layer hard-bypasses the payment gateway
        downstream: the host issues a valid $0 operational token natively and
        Dodo is never contacted.
        """
        payload_region = payload.get("region") if isinstance(payload, dict) else None
        header_region = self.headers.get("X-SG16-Region")
        geo_country = self.headers.get("CF-IPCountry") or self.headers.get(
            "X-Vercel-IP-Country"
        )
        return billing.resolve_region(payload_region, header_region, geo_country)

    def _api_subscribe(self, body: bytes) -> None:
        """Host-signed subscription record (sovereign local issuance path)."""
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        if not isinstance(payload, dict):
            return self._error(400, "body must be a json object")
        pass_id = str(payload.get("pass", ""))
        region = self._resolve_region(payload)
        try:
            record = billing.issue_record(
                pass_id,
                region,
                self.server.billing_secret,
                provider=str(payload.get("provider", "guest")),
            )
        except billing.VerificationError as exc:
            return self._error(400, str(exc))
        record["gateway"] = (
            "humanitarian-bypass" if record["humanitarian_bypass"] else "local"
        )
        self.server.passes[record["token"]] = record
        self._json(record)

    # ------------------------------------------------------------------
    # Dodo Payments MoR checkout pipeline
    # ------------------------------------------------------------------
    def _api_dodo_checkout(self, body: bytes) -> None:
        """Create a Dodo checkout session for one subscription pass.

        Palestine is intercepted before the gateway: the humanitarian region
        receives a signed $0 record straight from this host.  Without gateway
        credentials the sovereign local issuance path answers instead, so the
        dashboard stays fully functional air-gapped.
        """
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        if not isinstance(payload, dict):
            return self._error(400, "body must be a json object")
        pass_id = str(payload.get("pass", ""))
        region = self._resolve_region(payload)
        session_id = str(payload.get("session_id") or "dodo-guest")

        # --- humanitarian interceptor: the gateway never runs for Palestine
        if region == billing.HUMANITARIAN_REGION:
            try:
                record = billing.issue_record(
                    pass_id, region, self.server.billing_secret, provider="humanitarian"
                )
            except billing.VerificationError as exc:
                return self._error(400, str(exc))
            record["gateway"] = "humanitarian-bypass"
            self.server.passes[record["token"]] = record
            return self._json({"mode": "humanitarian_bypass", "record": record})

        try:
            self.server.throttle.check(session_id, len(body), exempt=False)
        except ThrottleExceeded as exc:
            return self._error(429, str(exc))

        if self.server.dodo is None:
            try:
                record = billing.issue_record(
                    pass_id,
                    region,
                    self.server.billing_secret,
                    provider=str(payload.get("provider", "guest")),
                )
            except billing.VerificationError as exc:
                return self._error(400, str(exc))
            record["gateway"] = "local"
            self.server.passes[record["token"]] = record
            return self._json({"mode": "local", "record": record})

        product_id = self.server.config.dodo_product_ids.get(pass_id, "")
        return_url = str(payload.get("return_url") or self.headers.get("Origin") or "")
        try:
            request_body = billing.checkout_request_body(
                product_id, pass_id, region, return_url
            )
        except billing.VerificationError as exc:
            return self._error(400, str(exc))
        try:
            session = self.server.dodo.create_checkout(request_body)
        except DodoError as exc:
            return self._error(
                exc.status if exc.status in (400, 401, 402, 403, 422) else 502,
                str(exc),
            )
        checkout_id = str(session.get("session_id") or session.get("payment_id") or "")
        if not checkout_id or not session.get("checkout_url"):
            return self._error(502, "dodo payments returned an unusable checkout session")
        self.server.dodo_pending[checkout_id] = {
            "pass": pass_id,
            "region": region,
            "session_id": checkout_id,
            "status": "pending",
            "opened_at": int(time.time()),
        }
        self._json(
            {
                "mode": "dodo",
                "session_id": checkout_id,
                "checkout_url": session["checkout_url"],
                "pass": pass_id,
            }
        )

    def _api_dodo_webhook(self, body: bytes) -> None:
        """Receive Dodo's signed payment confirmation.

        The raw body is verified against the Standard Webhooks signature
        before anything is parsed; only then is the duration-locked pass
        record signed and stored for client pickup via /api/dodo/confirm.
        """
        secret = self.server.config.dodo_webhook_secret
        if not secret:
            return self._error(503, "dodo webhook secret is not configured on this host")
        try:
            billing.verify_webhook_signature(
                secret,
                self.headers.get("webhook-id"),
                self.headers.get("webhook-timestamp"),
                self.headers.get("webhook-signature"),
                body,
            )
        except billing.VerificationError as exc:
            return self._error(403, str(exc))
        try:
            event = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"webhook body is not valid json: {exc}")
        if not isinstance(event, dict):
            return self._error(400, "webhook body must be a json object")
        event_type = str(event.get("type", ""))
        if event_type not in billing.WEBHOOK_SUCCESS_EVENTS:
            return self._json({"received": True, "event": event_type, "acted": False})
        try:
            record = billing.record_from_webhook(event, self.server.billing_secret)
        except billing.VerificationError as exc:
            return self._error(400, str(exc))
        record["gateway"] = "dodo"
        self.server.passes[record["token"]] = record
        payment = billing.event_payment_object(event)
        for key in (
            payment.get("session_id"),
            payment.get("payment_id"),
            payment.get("checkout_id"),
        ):
            pending = self.server.dodo_pending.get(str(key)) if key else None
            if pending is not None:
                pending["status"] = "paid"
                pending["record_token"] = record["token"]
        self._json(
            {
                "received": True,
                "event": event_type,
                "acted": True,
                "pass": record["pass"],
            }
        )

    def _api_dodo_confirm(self, body: bytes) -> None:
        """Client pickup after returning from the Dodo checkout.

        Returns the signed, duration-locked record once the webhook has
        confirmed the payment; 202 while the confirmation is still in flight.
        """
        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._error(400, f"body is not valid json: {exc}")
        checkout_id = str(payload.get("session_id", "")) if isinstance(payload, dict) else ""
        if not checkout_id:
            return self._error(400, "session_id is required")
        pending = self.server.dodo_pending.get(checkout_id)
        if pending is None:
            return self._error(404, "no such checkout session on this host")
        if pending.get("status") != "paid" or "record_token" not in pending:
            return self._json(
                {"confirmed": False, "status": pending.get("status", "pending")},
                status=202,
            )
        record = self.server.passes.get(pending["record_token"])
        if record is None:
            return self._error(410, "the confirmed record is no longer available")
        self._json({"confirmed": True, "record": record})

    def _api_billing(self) -> None:
        cfg = self.brain_config
        self._json(
            {
                "currency": "USD",
                "humanitarian_region": billing.HUMANITARIAN_REGION,
                "passes": {
                    pid: {"label": spec.label, "price": spec.price, "hours": spec.hours}
                    for pid, spec in billing.PASSES.items()
                },
                "owner_bypass": "token_accounting+throttles only; safety never",
                "gateway": {
                    "provider": "dodo-payments",
                    "model": "merchant-of-record",
                    "mode": "live-mor" if cfg.dodo_api_key else "sovereign-local",
                    "test_mode": cfg.dodo_test_mode,
                    "endpoints": {
                        "checkout": "/api/dodo/checkout",
                        "webhook": "/api/dodo/webhook",
                        "confirm": "/api/dodo/confirm",
                    },
                    "humanitarian_intercept": (
                        f"{billing.HUMANITARIAN_REGION} bypasses the gateway "
                        "entirely: $0 operational token issued natively"
                    ),
                    "storage": (
                        "the signed record is committed to the user's on-device "
                        "sg16/ storage directory; the host keeps 0 client logs"
                    ),
                },
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

        try:
            transaction = self.server.submit_locked(  # type: ignore[attr-defined]
                text,
                session_id=session_id,
                audio=audio,
                declared_transcript=payload.get("declared_transcript"),
            )
        except AUDIO_DECODE_ERRORS as exc:
            if audio is None:
                raise  # no audio aboard: a genuine server fault is never masked
            # Bug #2: a malformed container, truncated envelope or broken PCM
            # block is a *predictable validation error*, not a crash.  The
            # client gets a structured 400 and the socket stays clean.
            return self._error(400, f"audio payload rejected: {exc}")
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
        try:
            transaction = self.server.submit_locked(  # type: ignore[attr-defined]
                "",
                session_id=session_id,
                audio=body,
                declared_transcript=declared,
            )
        except AUDIO_DECODE_ERRORS as exc:
            # Bug #2: same boundary as /api/ingest - the payload is always
            # audio here, so the full container-parser family is a 400
            # validation, never an unhandled exception on the socket.
            return self._error(400, f"audio payload rejected: {exc}")
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
