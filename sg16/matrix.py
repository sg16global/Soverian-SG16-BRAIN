"""SG16 BRAIN - structural processing matrix.

Block 3, rule 1: the structural processing matrix of the engine must be
compiled into pure, self-contained mathematics inside the brain.  No weight
file is downloaded, no daemon is started, no remote API is called.

Every matrix in the brain is synthesised from a *named seed* by SHA-256 in
counter mode.  SHA-256 is standardised (FIPS 180-4) and present in every
CPython build, so the same seed produces the same Q16.16 matrix on a laptop in
Kuala Lumpur and on an air-gapped machine in a basement.  That is what makes
the engine a *fixed mathematical invariant bound to the environment* rather
than a bundle of files that can drift.

Devstral Small 2 / Voxtral weight sets, when a deployment chooses to supply
them, are loaded through :func:`from_rows` into exactly the same fixed-point
containers - the interface below is what they must satisfy.
"""

from __future__ import annotations

import hashlib
from typing import Iterable, Sequence

from . import fixed as F
from .tensor import Tensor

__all__ = ["draw", "build", "vector", "from_rows", "fingerprint", "SEED_ROOT"]

SEED_ROOT = "sg16.brain.v1"
_MASK = (1 << 32) - 1


def draw(seed: str, index: int) -> int:
    """One deterministic Q16.16 sample in [-1, 1) from ``seed`` and ``index``.

    SHA-256(seed|index) -> 256-bit int -> low 32 bits -> signed 16.16.
    """
    digest = hashlib.sha256(f"{SEED_ROOT}|{seed}|{index}".encode("utf-8")).digest()
    bits = int.from_bytes(digest[:4], "big") & _MASK
    # map 0..2^32-1 onto [-65536, 65536)
    return (bits >> 15) - F.FX_ONE


def build(seed: str, rows: int, cols: int, magnitude: int = F.FX_ONE) -> Tensor:
    """Synthesise a ``rows`` x ``cols`` matrix scaled by ``magnitude``."""
    if rows <= 0 or cols <= 0:
        raise ValueError("matrix dimensions must be positive")
    data = [F.mul(draw(seed, r * cols + c), magnitude) for r in range(rows) for c in range(cols)]
    return Tensor(rows, cols, data)


def vector(seed: str, length: int, magnitude: int = F.FX_ONE) -> list[int]:
    """Synthesise a deterministic vector, scaled by ``magnitude``."""
    return [F.mul(draw(seed, i), magnitude) for i in range(length)]


def from_rows(rows: Iterable[Sequence[int]]) -> Tensor:
    """Adopt externally supplied weights (e.g. a Devstral tensor shard).

    Values must already be Q16.16 integers.  This is the single seam through
    which real model weights can enter the sealed boundary.
    """
    return Tensor.from_rows(rows)


def fingerprint(*matrices: Tensor) -> str:
    """Stable digest of an ordered collection of matrices."""
    hasher = hashlib.sha256()
    for matrix in matrices:
        hasher.update(matrix.canonical_bytes())
        hasher.update(b"\x1e")
    return hasher.hexdigest()
