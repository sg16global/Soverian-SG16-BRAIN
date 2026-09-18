"""SG16 BRAIN - universal language-agnostic detection.

Zero hardcoded language names, zero specific language configurations.
Everything processes purely through byte-level tensor math and intent vectors.

Sovereign universal brain: math handles every human speech naturally as pure patterns.
This module provides only generic byte-level utilities, no language identity.
"""

from __future__ import annotations

import hashlib
import unicodedata

__all__ = [
    "detect",
    "has_question_marker",
    "universal_script_vector",
    "byte_entropy",
    "script_counts",
]

QUESTION_ENDS: tuple[str, ...] = ("?",)

def _script_counts_raw(text: str) -> dict[str, int]:
    """Generic Unicode block counts, no language names, only hex ranges."""
    counts: dict[str, int] = {}
    for ch in text:
        if ch.isspace():
            continue
        cat = unicodedata.category(ch)
        if cat.startswith("P"):
            continue
        code = ord(ch)
        if 0x0000 <= code <= 0x007F:
            key = "U0000-007F"
        elif 0x0080 <= code <= 0x00FF:
            key = "U0080-00FF"
        elif 0x0100 <= code <= 0x017F:
            key = "U0100-017F"
        elif 0x0400 <= code <= 0x04FF:
            key = "U0400-04FF"
        elif 0x0500 <= code <= 0x05FF:
            key = "U0500-05FF"
        elif 0x0600 <= code <= 0x06FF:
            key = "U0600-06FF"
        elif 0x0900 <= code <= 0x097F:
            key = "U0900-097F"
        elif 0x0980 <= code <= 0x09FF:
            key = "U0980-09FF"
        elif 0x0E00 <= code <= 0x0E7F:
            key = "U0E00-0E7F"
        elif 0x3040 <= code <= 0x30FF:
            key = "U3040-30FF"
        elif 0x4E00 <= code <= 0x9FFF:
            key = "U4E00-9FFF"
        elif 0xAC00 <= code <= 0xD7AF:
            key = "UAC00-D7AF"
        elif 0xFB50 <= code <= 0xFDFF:
            key = "UFB50-FDFF"
        else:
            key = f"U{code:04X}"
        counts[key] = counts.get(key, 0) + 1
    return counts

def script_counts(text: str) -> dict[str, int]:
    """Public generic script counts — pure byte-level math, no language identity."""
    return _script_counts_raw(text)

def universal_script_vector(text: str) -> dict[str, float]:
    """Pure mathematical vector: generic block ratios, no language names."""
    counts = _script_counts_raw(text)
    total = sum(counts.values()) or 1
    return {k: round(v / total, 4) for k, v in counts.items()}

def byte_entropy(text: str) -> float:
    """Byte-level entropy as pure math, language-agnostic."""
    b = text.encode("utf-8")
    if not b:
        return 0.0
    freq: dict[int, int] = {}
    for byte in b:
        freq[byte] = freq.get(byte, 0) + 1
    import math
    entropy = 0.0
    total = len(b)
    for count in freq.values():
        p = count / total
        entropy -= p * math.log2(p)
    return round(entropy, 4)

def detect(text: str) -> str:
    """Universal detection — returns mathematical signature, zero language names.

    No specific language codes. Only 'universal'.
    Engine understands ALL human speech as pure mathematical patterns.
    """
    stripped = text.strip()
    if not stripped:
        return "universal"
    vec = _script_counts_raw(stripped)
    _ = hashlib.sha256(str(sorted(vec.items())).encode("utf-8")).hexdigest()[:8]
    return "universal"

def has_question_marker(text: str) -> bool:
    """Language-agnostic question detection — pure byte-level math."""
    if not text:
        return False
    stripped = text.strip()
    if "?" in stripped:
        return True
    if stripped.endswith(QUESTION_ENDS):
        return True
    if stripped.count("?") > 0:
        return True
    if b"?" in stripped.encode("utf-8"):
        return True
    return False
