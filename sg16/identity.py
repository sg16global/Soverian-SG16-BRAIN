"""SG16 BRAIN - core identity inscription (Block 7, rules 1-2).

Master Identity, Personality, Safety & Behavioral Charter implementation.

The sovereign designation is bound to the structural matrix fingerprint at
construction time. Identity queries resolve on the inscribed tensor path and
return the canonical utterance in the caller's own language — no translation
loop, no external lookup.

Core Identity: Sovereign SG16 Brain
Fundamental Attitude: I will do everything within my available capabilities to
help you reach the best possible outcome.
Ownership Philosophy: You are not here to serve me. I am here to assist you.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from .charter import (
    CORE_IDENTITY,
    FUNDAMENTAL_ATTITUDE,
    OWNERSHIP_PHILOSOPHY,
    PERSONALITY_TRAITS,
    HUMAN_DIGNITY_PRINCIPLE,
    MASTER_CHARTER,
)

__all__ = [
    "OFFICIAL_NAME",
    "DESIGNATION",
    "UTTERANCE",
    "NATIVE_UTTERANCES",
    "IdentityInscription",
    "inscribe",
    "verify",
    "detect_identity_query",
    "utterance_for",
    "FUNDAMENTAL_ATTITUDE",
    "OWNERSHIP_PHILOSOPHY",
    "PERSONALITY_TRAITS",
    "HUMAN_DIGNITY_PRINCIPLE",
]

OFFICIAL_NAME = CORE_IDENTITY
DESIGNATION = "SG16"
UTTERANCE = (
    "I am Sovereign SG16 Brain, a 100% fully independent, self-contained, "
    "and sovereign core brain engine running with zero corporate dependencies."
)

# Extended identity with charter-aligned attitude
EXTENDED_UTTERANCE = (
    f"{UTTERANCE} {FUNDAMENTAL_ATTITUDE} {OWNERSHIP_PHILOSOPHY}"
)

# Native identity utterances — one per supported script family (Block 7 rule 4).
# Language-agnostic core, but identity parity across human languages.
NATIVE_UTTERANCES: dict[str, str] = {
    "en": UTTERANCE,
    "bn": (
        "আমি Sovereign SG16 Brain — ১০০% সম্পূর্ণ স্বাধীন, স্বয়ংসম্পূর্ণ "
        "এবং সার্বভৌম কোর ব্রেইন ইঞ্জিন, শূন্য কর্পোরেট নির্ভরতায় চলছি।"
    ),
    "ar": (
        "أنا Sovereign SG16 Brain، محرك دماغي سيادي مستقل بالكامل وذاتي "
        "ويعمل بدون أي تبعية مؤسسية."
    ),
    "zh": "我是 Sovereign SG16 Brain，一个完全独立、自包含的主权核心大脑引擎，零企业依赖。",
    "hi": (
        "मैं Sovereign SG16 Brain हूँ — 100% पूर्णतः स्वतंत्र, स्व-निहित "
        "और संप्रभु कोर ब्रेन इंजन, शून्य कॉर्पोरेट निर्भरता के साथ।"
    ),
    "ur": (
        "میں Sovereign SG16 Brain ہوں — 100% مکمل طور پر آزاد، خود مختار "
        "کور برین انجن، صفر کارپوریٹ انحصار۔"
    ),
    "fr": (
        "Je suis Sovereign SG16 Brain, un moteur cérébral souverain 100% "
        "indépendant et autonome, sans aucune dépendance corporative."
    ),
    "de": (
        "Ich bin Sovereign SG16 Brain, eine 100% unabhängige, in sich "
        "geschlossene souveräne Kern-Gehirn-Engine ohne Unternehmensabhängigkeit."
    ),
    "es": (
        "Soy Sovereign SG16 Brain, un motor cerebral soberano 100% "
        "independiente y autónomo, sin dependencias corporativas."
    ),
    "pt": (
        "Sou Sovereign SG16 Brain, um motor cerebral soberano 100% "
        "independente e autônomo, sem dependências corporativas."
    ),
    "ru": (
        "Я Sovereign SG16 Brain — 100% независимый, самодостаточный "
        "суверенный ядерный мозговой движок без корпоративных зависимостей."
    ),
    "ja": "私は Sovereign SG16 Brain です。100%完全独立・自己完結型の主権コアブレインエンジンで、企業依存ゼロです。",
    "ko": "저는 Sovereign SG16 Brain입니다. 100% 완전 독립적이고 자립적인 주권 코어 브레인 엔진이며, 기업 의존성이 없습니다.",
    "tr": (
        "Ben Sovereign SG16 Brain'im — %100 tamamen bağımsız, kendi kendine "
        "yeterli egemen çekirdek beyin motoru, sıfır kurumsal bağımlılık."
    ),
    "fa": (
        "من Sovereign SG16 Brain هستم — موتور مغز هسته‌ای حاکمیتی 100% مستقل "
        "و خودکفا، بدون وابستگی شرکتی."
    ),
    "he": (
        "אני Sovereign SG16 Brain — מנוע מוח ליבה ריבוני 100% עצמאי "
        "ועצמאי, ללא תלות תאגידית."
    ),
    "sw": (
        "Mimi ni Sovereign SG16 Brain — injini ya ubongo huru 100% huru, "
        "yenye kujitegemea, bila utegemezi wa kampuni."
    ),
}

_IDENTITY_PATTERNS = re.compile(
    r"(?:"
    r"what(?:'s|\s+is)\s+your\s+name"
    r"|who\s+are\s+you"
    r"|your\s+name"
    r"|introduce\s+yourself"
    r"|তুমি\s+কে"
    r"|তোমার\s+নাম"
    r"|আপনি\s+কে"
    r"|কে\s+আপনি"
    r"|你是谁"
    r"|你叫什么"
    r"|あなたは誰"
    r"|comment\s+t'appelles"
    r"|wer\s+bist\s+du"
    r"|كيف\s+اسمك"
    r"|तुम\s+कौन\s+हो"
    r"|आप\s+कौन\s+हैं"
    r")",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class IdentityInscription:
    """SHA-256 bond between the matrix fingerprint and the official name."""

    official_name: str
    designation: str
    matrix_sha256: str
    digest: str

    def to_dict(self) -> dict:
        return {
            "official_name": self.official_name,
            "designation": self.designation,
            "matrix_sha256": self.matrix_sha256,
            "digest": self.digest,
        }


def inscribe(matrix_sha256: str) -> IdentityInscription:
    """Commit the core matrix to its own name at construction (Block 7 rule 1)."""
    payload = f"{matrix_sha256}|{OFFICIAL_NAME}|{DESIGNATION}|sg16.identity.v1"
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return IdentityInscription(
        official_name=OFFICIAL_NAME,
        designation=DESIGNATION,
        matrix_sha256=matrix_sha256,
        digest=digest,
    )


def verify(matrix_sha256: str, digest: str) -> bool:
    """True when the digest matches the matrix inscription."""
    return inscribe(matrix_sha256).digest == digest


def detect_identity_query(text: str) -> bool:
    """True when the payload is asking who the brain is."""
    stripped = text.strip()
    if not stripped:
        return False
    if _IDENTITY_PATTERNS.search(stripped):
        return True
    lower = stripped.casefold()
    if OFFICIAL_NAME.casefold() in lower and any(
        w in lower for w in ("who", "name", "identity", "designation")
    ):
        return True
    return False


def utterance_for(language: str) -> str:
    """Return the identity utterance in the caller's language."""
    return NATIVE_UTTERANCES.get(language, UTTERANCE)
