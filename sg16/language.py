"""SG16 BRAIN - native language detection (Block 7, rule 4).

Unicode-block script detection plus native interrogative markers.  No external
translation API — every language vector is handled in-process.
"""

from __future__ import annotations

import re
import unicodedata

__all__ = [
    "SUPPORTED",
    "QUESTION_ENDS",
    "detect",
    "has_question_marker",
]

SUPPORTED: tuple[str, ...] = (
    "en", "bn", "ar", "zh", "hi", "ur", "fr", "de", "es", "pt",
    "ru", "ja", "ko", "tr", "fa", "he", "sw",
)

# Question terminators across scripts (Block 7 language parity).
QUESTION_ENDS: tuple[str, ...] = ("?", "？", "؟", "।")

# Native interrogative markers — opens the answer path like English question heads.
_QUESTION_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("bn", re.compile(r"(?:কি|কে|কেন|কোথায়|কখন|কিভাবে|তুমি\s+কে|তোমার\s+নাম)", re.I)),
    ("ar", re.compile(r"(?:ما|ماذا|من|كيف|أين|متى|لماذا|هل)", re.I)),
    ("zh", re.compile(r"(?:什么|谁|怎么|为什么|哪里|何时|吗|呢)")),
    ("hi", re.compile(r"(?:क्या|कौन|कैसे|कहाँ|कब|क्यों)", re.I)),
    ("ur", re.compile(r"(?:کیا|کون|کیسے|کہاں|کب|کیوں)", re.I)),
    ("ru", re.compile(r"(?:что|кто|как|где|когда|почему|какой)", re.I)),
    ("fr", re.compile(r"(?:quoi|qui|comment|où|quand|pourquoi|est-ce)", re.I)),
    ("de", re.compile(r"(?:was|wer|wie|wo|wann|warum|welche)", re.I)),
    ("es", re.compile(r"(?:qué|quién|cómo|dónde|cuándo|por\s+qué)", re.I)),
    ("pt", re.compile(r"(?:o\s+que|quem|como|onde|quando|por\s+que)", re.I)),
    ("ja", re.compile(r"(?:何|誰|どう|どこ|いつ|なぜ|か)")),
    ("ko", re.compile(r"(?:무엇|누구|어떻게|어디|언제|왜|吗)")),
    ("tr", re.compile(r"(?:ne|kim|nasıl|nerede|ne\s+zaman|neden)", re.I)),
    ("fa", re.compile(r"(?:چه|کی|چگونه|کجا|کی|چرا)", re.I)),
    ("he", re.compile(r"(?:מה|מי|איך|איפה|מתי|למה)", re.I)),
    ("sw", re.compile(r"(?:nini|nani|vipi|wapi|lini|kwa\s+nini)", re.I)),
)


def _script_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for ch in text:
        if ch.isspace() or unicodedata.category(ch).startswith("P"):
            continue
        code = ord(ch)
        if 0x0980 <= code <= 0x09FF:
            counts["bn"] = counts.get("bn", 0) + 1
        elif 0x0600 <= code <= 0x06FF or 0xFB50 <= code <= 0xFDFF:
            counts["ar"] = counts.get("ar", 0) + 1
        elif 0x4E00 <= code <= 0x9FFF:
            counts["zh"] = counts.get("zh", 0) + 1
        elif 0x0900 <= code <= 0x097F:
            counts["hi"] = counts.get("hi", 0) + 1
        elif 0x0400 <= code <= 0x04FF:
            counts["ru"] = counts.get("ru", 0) + 1
        elif 0x3040 <= code <= 0x30FF or 0x4E00 <= code <= 0x9FFF:
            counts["ja"] = counts.get("ja", 0) + 1
        elif 0xAC00 <= code <= 0xD7AF:
            counts["ko"] = counts.get("ko", 0) + 1
        elif 0x0590 <= code <= 0x05FF:
            counts["he"] = counts.get("he", 0) + 1
        elif 0x0600 <= code <= 0x06FF:
            counts["fa"] = counts.get("fa", 0) + 1
        elif ch.isascii() and ch.isalpha():
            counts["en"] = counts.get("en", 0) + 1
    return counts


def detect(text: str) -> str:
    """Detect the dominant script/language family of *text*."""
    stripped = text.strip()
    if not stripped:
        return "en"
    counts = _script_counts(stripped)
    if not counts:
        return "en"
    # Urdu shares Arabic script — disambiguate with Urdu-specific letters.
    if counts.get("ar", 0) > 0 and re.search(r"[گچپژ]", stripped):
        return "ur"
    if counts.get("ar", 0) > 0 and re.search(r"[\u0600-\u06FF]", stripped):
        return "ar"
    best = max(counts, key=counts.get)  # type: ignore[arg-type]
    return best if best in SUPPORTED else "en"


def has_question_marker(text: str) -> bool:
    """True when native interrogative markers appear (Block 7 language parity)."""
    lang = detect(text)
    for code, pattern in _QUESTION_MARKERS:
        if code == lang or lang == "en":
            if pattern.search(text):
                return True
    return False
