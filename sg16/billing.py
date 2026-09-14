"""SG16 BRAIN - server-backed subscription model.

This is the authoritative mirror of the client billing structure
(``web/src/billing.js``).  The host re-derives every price and every expiry, so
a client cannot spoof a tier by editing its template: a subscription record is
only valid when its token recomputes against the host secret **and** its
``price_charged`` equals the price the host derives for the claimed tier and
region.

Tiers (identical on both sides):

    day   24-Hour Entry    $3   24 h
    week  1-Week Premium   $5   7 d
    half  15-Day Premium   $8   15 d
    month 1-Month Premium  $15  30 d

Humanitarian rule: region ``Palestine`` is a zero-rate billing bypass - the
price is 0 and the dashboard stays open.  This is a *grant*, evaluated by the
host from the declared region; the host performs no external geolocation.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Mapping

__all__ = [
    "Pass",
    "PASSES",
    "HUMANITARIAN_REGION",
    "effective_price",
    "issue_record",
    "verify_record",
    "VerificationError",
]

HUMANITARIAN_REGION = "Palestine"


@dataclass(frozen=True)
class Pass:
    id: str
    label: str
    price: int
    hours: int


PASSES: Mapping[str, Pass] = {
    "day": Pass("day", "24-Hour Entry", 3, 24),
    "week": Pass("week", "1-Week Premium", 5, 24 * 7),
    "half": Pass("half", "15-Day Premium", 8, 24 * 15),
    "month": Pass("month", "1-Month Premium", 15, 24 * 30),
}


class VerificationError(ValueError):
    """Raised when a subscription record fails structural cross-verification."""


def effective_price(pass_id: str, region: str | None) -> int:
    """Host-derived price.  Humanitarian region => zero-rate bypass."""
    if pass_id not in PASSES:
        raise VerificationError(f"unknown pass tier: {pass_id!r}")
    if region == HUMANITARIAN_REGION:
        return 0
    return PASSES[pass_id].price


def _token(secret: str, pass_id: str, region: str, price: int, expires_epoch: int) -> str:
    body = f"{secret}|{pass_id}|{region or ''}|{price}|{expires_epoch}"
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def issue_record(
    pass_id: str,
    region: str | None,
    secret: str,
    provider: str = "guest",
    now: float | None = None,
) -> dict:
    """Create a server-signed subscription record."""
    if pass_id not in PASSES:
        raise VerificationError(f"unknown pass tier: {pass_id!r}")
    now = time.time() if now is None else now
    spec = PASSES[pass_id]
    price = effective_price(pass_id, region)
    expires_epoch = int(now + spec.hours * 3600)
    return {
        "pass": pass_id,
        "label": spec.label,
        "provider": provider,
        "region": region,
        "list_price": spec.price,
        "price_charged": price,
        "humanitarian_bypass": region == HUMANITARIAN_REGION,
        "activated_at": int(now),
        "expires_at": expires_epoch,
        "token": _token(secret, pass_id, region, price, expires_epoch),
        "verified_by": "sg16-host",
    }


def verify_record(record: Mapping, secret: str, now: float | None = None) -> dict:
    """Cross-verify a subscription record against the host's own derivation.

    Raises :class:`VerificationError` on any inconsistency: unknown tier,
    price mismatch (spoofed tier/region), forged token, or expiry that does not
    match the tier's duration.
    """
    now = time.time() if now is None else now
    pass_id = record.get("pass")
    if pass_id not in PASSES:
        raise VerificationError(f"unknown pass tier: {pass_id!r}")
    spec = PASSES[pass_id]
    region = record.get("region")

    expected_price = effective_price(pass_id, region)
    if int(record.get("price_charged", -1)) != expected_price:
        raise VerificationError(
            f"price spoofing: record claims {record.get('price_charged')} but "
            f"{pass_id} in {region!r} is {expected_price}"
        )
    if int(record.get("list_price", -1)) != spec.price:
        raise VerificationError("list_price does not match the tier")

    activated = int(record.get("activated_at", 0))
    expires = int(record.get("expires_at", 0))
    if expires - activated != spec.hours * 3600:
        raise VerificationError("expiry does not match the tier duration")
    if expires < now:
        raise VerificationError("subscription expired")

    expected_token = _token(secret, pass_id, region, expected_price, expires)
    if record.get("token") != expected_token:
        raise VerificationError("token does not recompute - record was not issued by this host")

    return dict(record)
