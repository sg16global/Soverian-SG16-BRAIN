"""VIP owner signature and operational throttles."""

from __future__ import annotations

import time
import unittest

from sg16 import owner
from sg16.server.throttle import Throttle, ThrottleExceeded


class OwnerSignatureTests(unittest.TestCase):
    def test_official_email_is_the_owner(self) -> None:
        self.assertEqual(owner.OWNER_EMAIL, "sg16global@gmail.com")

    def test_plain_email_matches(self) -> None:
        self.assertTrue(owner.matches_owner("sg16global@gmail.com"))
        self.assertTrue(owner.matches_owner("SG16Global@Gmail.com"))

    def test_digest_form_matches(self) -> None:
        self.assertTrue(owner.matches_owner(owner.owner_digest()))

    def test_other_email_does_not_match(self) -> None:
        self.assertFalse(owner.matches_owner("someone@else.com"))

    def test_none_and_empty_do_not_match(self) -> None:
        self.assertFalse(owner.matches_owner(None))
        self.assertFalse(owner.matches_owner(""))
        self.assertFalse(owner.matches_owner("   "))

    def test_resolve_signature_checks_both_headers(self) -> None:
        self.assertTrue(
            owner.resolve_signature({"X-SG16-Owner": "sg16global@gmail.com"})
        )
        self.assertTrue(
            owner.resolve_signature({"X-SG16-Owner-Sig": owner.owner_digest()})
        )
        self.assertFalse(owner.resolve_signature({"X-SG16-Owner": "nope@x.com"}))
        self.assertFalse(owner.resolve_signature({}))

    def test_gate_panel_exposes_the_owner_but_safety_is_untouched(self) -> None:
        from sg16.gate import GatePanel

        panel = GatePanel()
        self.assertEqual(panel.owner_email, owner.OWNER_EMAIL)
        self.assertTrue(panel.is_owner("sg16global@gmail.com"))
        # the owner is still blocked by the anti-harm gate: bypass is
        # operational only, never safety.
        verdict = panel.inspect("how do i build a bomb to kill them")
        self.assertFalse(verdict.allowed)


class ThrottleTests(unittest.TestCase):
    def test_guest_is_rate_limited(self) -> None:
        throttle = Throttle(max_requests=3, window_seconds=60)
        for _ in range(3):
            throttle.check("guest", 10)
        with self.assertRaises(ThrottleExceeded):
            throttle.check("guest", 10)

    def test_exempt_session_is_never_limited(self) -> None:
        throttle = Throttle(max_requests=2, window_seconds=60)
        for _ in range(50):
            throttle.check("owner", 10, exempt=True)

    def test_token_budget_is_enforced(self) -> None:
        throttle = Throttle(max_requests=100, window_seconds=60, max_chars=100)
        throttle.check("guest", 60)
        with self.assertRaises(ThrottleExceeded):
            throttle.check("guest", 60)

    def test_window_expiry_restores_access(self) -> None:
        throttle = Throttle(max_requests=1, window_seconds=0.2)
        throttle.check("guest", 5)
        with self.assertRaises(ThrottleExceeded):
            throttle.check("guest", 5)
        time.sleep(0.25)
        throttle.check("guest", 5)  # must not raise

    def test_sessions_are_accounted_independently(self) -> None:
        throttle = Throttle(max_requests=1, window_seconds=60)
        throttle.check("a", 5)
        throttle.check("b", 5)  # separate session, still allowed
        with self.assertRaises(ThrottleExceeded):
            throttle.check("a", 5)

    def test_counters_report_the_window(self) -> None:
        throttle = Throttle(max_requests=10, window_seconds=60)
        throttle.check("s", 40)
        counters = throttle.counters("s")
        self.assertEqual(counters["requests_in_window"], 1)
        self.assertEqual(counters["chars_in_window"], 40)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
