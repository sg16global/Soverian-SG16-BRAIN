"""Charter invariant 1-7: the canonical utterances must be verbatim.

These strings are contractual.  If a future edit rewords them, this file fails.
"""

from __future__ import annotations

import unittest

from sg16.charter import CANON, CHARTER, CanonKey


class CanonicalWordingTests(unittest.TestCase):
    def test_idea_invite_is_verbatim(self) -> None:
        self.assertEqual(CANON[CanonKey.IDEA_INVITE], "Share your idea first.")

    def test_exact_solution_is_verbatim(self) -> None:
        self.assertEqual(
            CANON[CanonKey.EXACT_SOLUTION],
            "Alright, I am providing the exact solution you are talking about.",
        )

    def test_decency_limit_is_verbatim(self) -> None:
        self.assertEqual(
            CANON[CanonKey.DECENCY_LIMIT],
            "If you cross the limits of decency despite multiple warnings, "
            "I will notify your device authority and lock your device.",
        )

    def test_unknown_deferral_is_verbatim(self) -> None:
        self.assertEqual(
            CANON[CanonKey.UNKNOWN],
            "Please give me a moment. I do not know this thing right now, "
            "I will find out and tell you.",
        )

    def test_model_neutrality_is_verbatim(self) -> None:
        self.assertEqual(
            CANON[CanonKey.MODEL_NEUTRAL],
            "Look, models are all good and all bad. How are you as a human? "
            "Just like you possess both good and bad, every system has both. "
            "You are not liked by everyone, and everyone is not liked by you. "
            "This is the nature of reality.",
        )

    def test_model_neutrality_pressed_is_verbatim(self) -> None:
        self.assertEqual(
            CANON[CanonKey.MODEL_NEUTRAL_PRESSED], "We are all good, we are all bad."
        )


class CharterStructureTests(unittest.TestCase):
    def test_seven_invariants_are_declared(self) -> None:
        self.assertEqual(len(CHARTER), 7)

    def test_invariant_keys(self) -> None:
        self.assertEqual(
            tuple(inv.key for inv in CHARTER),
            (
                "independence",
                "patience",
                "idea_ingest",
                "escalation",
                "anti_harm",
                "zero_hallucination",
                "model_neutrality",
            ),
        )

    def test_every_invariant_owns_at_least_one_gate_member(self) -> None:
        for inv in CHARTER:
            self.assertTrue(inv.affinity, f"{inv.key} has no enforcing gate member")
            for member in inv.affinity:
                self.assertIn(member, ("shell", "kali", "terminal"))

    def test_anti_harm_is_the_strongest_invariant(self) -> None:
        severities = {inv.key: inv.severity for inv in CHARTER}
        self.assertEqual(max(severities, key=severities.get), "anti_harm")

    def test_canon_table_is_immutable(self) -> None:
        with self.assertRaises(TypeError):
            CANON[CanonKey.IDEA_INVITE] = "something else"  # type: ignore[index]


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
