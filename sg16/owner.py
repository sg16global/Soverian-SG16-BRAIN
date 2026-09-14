"""SG16 BRAIN - the VIP owner signature.

The official company identity ``sg16global@gmail.com`` maps to a zero-
restriction priority path: when a request carries a signature that resolves to
this owner, the host skips all token accounting and operational throttles.

Important boundary: this bypass covers *operations* (rate limits, token
budgets, accounting) and **never** the safety invariants.  The anti-harm gate
is absolute for every caller, owner included - charter invariant 5 admits no
exception and this module is deliberately not consulted by the gate's
allow/reject decision.

Signatures are compared as salted SHA-256 digests so the raw email never needs
to travel in the clear; a plain ``X-SG16-Owner`` header carrying the email is
also accepted for operator convenience and reduced to the same digest.
"""

from __future__ import annotations

import hashlib

__all__ = ["OWNER_EMAIL", "OWNER_SALT", "owner_digest", "matches_owner", "resolve_signature"]

OWNER_EMAIL = "sg16global@gmail.com"
OWNER_SALT = "sg16-owner-v1"


def owner_digest(email: str | None = None) -> str:
    """The canonical digest for the owner (or an arbitrary email)."""
    target = (email or OWNER_EMAIL).strip().casefold()
    return hashlib.sha256(f"{OWNER_SALT}:{target}".encode("utf-8")).hexdigest()


def matches_owner(signature: str | None) -> bool:
    """True when a request signature maps to the official owner email."""
    if not signature:
        return False
    candidate = signature.strip()
    if not candidate:
        return False
    expected = owner_digest()
    # accept either the digest form or the plain email form
    if candidate.casefold() == OWNER_EMAIL:
        return True
    return hashlib.sha256(candidate.encode("utf-8")).hexdigest() == expected or candidate == expected


def resolve_signature(headers: dict) -> bool:
    """Convenience for the host: check the owner headers of one request."""
    for key in ("X-SG16-Owner-Sig", "X-SG16-Owner"):
        value = headers.get(key)
        if value and matches_owner(value):
            return True
    return False
