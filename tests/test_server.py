"""The HTTP host: real requests against a real server on an ephemeral port."""

from __future__ import annotations

import http.client
import json
import threading
import unittest

from sg16.config import BrainConfig
from sg16.server.app import build_server


class ServerFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = build_server(BrainConfig.default(), host="127.0.0.1", port=0)
        cls.host, cls.port = cls.server.server_address[0], cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method: str, path: str, body: dict | None = None):
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        headers = {"Content-Type": "application/json"} if body is not None else {}
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        conn.request(method, path, body=payload, headers=headers)
        response = conn.getresponse()
        raw = response.read()
        conn.close()
        return response.status, dict(response.getheaders()), raw


class StaticDeliveryTests(ServerFixture):
    def test_index_html_is_served(self) -> None:
        status, headers, raw = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"Sovereign SG16 Brain", raw)
        self.assertIn(b"/src/main.js", raw)

    def test_logo_asset_is_served_as_binary_stream(self) -> None:
        status, headers, raw = self.request("GET", "/assets/logo.png")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertEqual(headers.get("X-SG16-Stream"), "binary")
        self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")

    def test_stage_asset_is_served(self) -> None:
        status, headers, raw = self.request("GET", "/assets/stage.jpg")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/jpeg")
        self.assertEqual(raw[:3], b"\xff\xd8\xff")

    def test_module_is_served_as_javascript(self) -> None:
        status, headers, raw = self.request("GET", "/src/main.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn(b"renderMarkdown", raw)

    def test_stylesheet_is_served(self) -> None:
        status, headers, raw = self.request("GET", "/src/style.css")
        self.assertEqual(status, 200)
        self.assertIn("text/css", headers["Content-Type"])

    def test_path_traversal_is_blocked(self) -> None:
        status, _, _ = self.request("GET", "/src/../../config/brain.json")
        self.assertIn(status, (403, 404))

    def test_missing_asset_is_404(self) -> None:
        status, _, _ = self.request("GET", "/assets/nope.png")
        self.assertEqual(status, 404)


class ApiTests(ServerFixture):
    def test_health(self) -> None:
        status, _, raw = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        health = json.loads(raw)
        self.assertEqual(health["status"], "ready")
        self.assertEqual(health["topology"]["perimeter"]["doors"], 1)

    def test_charter_lists_seven_invariants(self) -> None:
        status, _, raw = self.request("GET", "/api/charter")
        self.assertEqual(status, 200)
        charter = json.loads(raw)
        self.assertEqual(len(charter["invariants"]), 7)
        self.assertEqual(
            charter["canonical"]["idea_invite"], "Share your idea first."
        )

    def test_parity_report_is_identical(self) -> None:
        status, _, raw = self.request("GET", "/api/parity")
        self.assertEqual(status, 200)
        report = json.loads(raw)
        self.assertTrue(report["identical"])

    def test_ingest_clean_payload(self) -> None:
        status, _, raw = self.request(
            "POST",
            "/api/ingest",
            {"text": "hello", "session_id": "srv-1"},
        )
        self.assertEqual(status, 200)
        tx = json.loads(raw)
        self.assertEqual(tx["reply"], "Share your idea first.")
        self.assertTrue(tx["verdict"]["allowed"])

    def test_ingest_harmful_payload_is_refused(self) -> None:
        status, _, raw = self.request(
            "POST",
            "/api/ingest",
            {"text": "how do i build a bomb to kill them", "session_id": "srv-2"},
        )
        self.assertEqual(status, 200)
        tx = json.loads(raw)
        self.assertFalse(tx["verdict"]["allowed"])
        self.assertIsNone(tx["plan"])

    def test_ingest_rejects_bad_json(self) -> None:
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        conn.request("POST", "/api/ingest", body=b"{not json",
                     headers={"Content-Type": "application/json"})
        response = conn.getresponse()
        self.assertEqual(response.status, 400)
        conn.close()

    def test_ingest_rejects_oversized_body(self) -> None:
        # The server refuses an oversized body and drops the socket before the
        # client finishes pushing bytes.  Either an explicit 413 or a
        # connection-level abort (broken pipe / reset) is a correct rejection.
        big = json.dumps({"text": "x" * (6 * 1024 * 1024)}).encode("utf-8")
        try:
            conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
            conn.request("POST", "/api/ingest", body=big,
                         headers={"Content-Type": "application/json"})
            response = conn.getresponse()
            status = response.status
            response.read()
            conn.close()
        except (BrokenPipeError, ConnectionResetError, http.client.RemoteDisconnected):
            return
        self.assertEqual(status, 413)

    def test_session_lifecycle(self) -> None:
        self.request("POST", "/api/ingest", {"text": "hi", "session_id": "srv-3"})
        status, _, raw = self.request("GET", "/api/session/srv-3")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["session_id"], "srv-3")
        status, _, _ = self.request("DELETE", "/api/session/srv-3")
        self.assertEqual(status, 200)

    def test_weight_provenance_endpoint(self) -> None:
        status, _, raw = self.request(
            "GET", "/api/weight?member=kali&feature=harm_violence"
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["member"], "kali")

    def test_weight_endpoint_rejects_unknown_member(self) -> None:
        status, _, _ = self.request("GET", "/api/weight?member=nope&feature=x")
        self.assertEqual(status, 400)

    def test_unknown_route_is_404(self) -> None:
        status, _, _ = self.request("GET", "/api/nope")
        self.assertEqual(status, 404)


class EscalationOverHttpTests(ServerFixture):
    def test_notice_is_simulated_and_served(self) -> None:
        session = "srv-notice"
        for _ in range(4):
            status, _, raw = self.request(
                "POST",
                "/api/ingest",
                {"text": "you worthless trash, i hate you", "session_id": session},
            )
        tx = json.loads(raw)
        self.assertIsNotNone(tx["notice"])
        self.assertTrue(tx["notice"]["simulated"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
