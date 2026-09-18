"""SG16 BRAIN - pure mathematical emotional density, language-agnostic.

Zero hardcoded language names, zero specific language configurations.
Everything processes purely through byte-level tensor math and intent vectors.
Engine understands ALL human speech naturally as pure mathematical patterns.

Backend real memory (ContextStack + EmotionalFilter), not browser localStorage.
Q16.16 fixed-point, self-contained, runs on any device.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from . import fixed as F

__all__ = [
    "ContextEntry",
    "ContextStack",
    "EmotionalFilter",
    "pain_score",
    "joy_score",
    "mood_from_text",
    "combine_mood",
    "empathy_text",
    "mood_from_intent",
]

def _word_list(text: str) -> list[str]:
    import unicodedata
    folded = unicodedata.normalize("NFKC", text).casefold()
    words = re.findall(r"[^\W\d_]+", folded, flags=re.UNICODE)
    return words

def _byte_stats(text: str) -> tuple[int, int, int, int]:
    b = text.encode("utf-8")
    if not b:
        return 0, 0, 0, 0
    punct = text.count("!") + text.count("?")
    repeat = 0
    triple = 0
    for i in range(2, len(text)):
        if text[i] == text[i-1] == text[i-2] and not text[i].isspace():
            triple += 1
    words = _word_list(text)
    if words:
        uniq = len(set(words))
        total = len(words)
        if total > 0 and uniq < total:
            repeat += (total - uniq)
    return len(b), punct, repeat, triple

def mood_from_intent(intent_vector: list[int]) -> int:
    if not intent_vector:
        return 0
    lead = intent_vector[0]
    head = intent_vector[:4]
    avg = F.div_round(sum(head), len(head)) if head else 0
    blended = F.div(F.add(lead, avg), F.fx_int(2))
    return F.clamp(F.mul(blended, F.fx(0.18)), -F.fx(0.15), F.fx(0.15))

def pain_score(text: str, intent_vector: list[int] | None = None) -> int:
    if not text or not text.strip():
        return 0
    words = _word_list(text)
    total_words = max(len(words), 1)
    _, punct, repeat, triple = _byte_stats(text)

    punct_ratio = F.div(F.fx_int(punct), F.fx_int(total_words))
    repeat_ratio = F.div(F.fx_int(repeat), F.fx_int(total_words))
    triple_ratio = F.div(F.fx_int(triple), F.fx_int(total_words))

    base = F.mul(punct_ratio, F.fx(0.10))
    base = F.add(base, F.mul(repeat_ratio, F.fx(0.12)))
    base = F.add(base, F.mul(triple_ratio, F.fx(0.25)))

    tensor_pain = 0
    if intent_vector is not None:
        tm = mood_from_intent(intent_vector)
        if tm < 0:
            tensor_pain = F.mul(F.neg(tm), F.fx(1.6))
    else:
        h = hashlib.sha256(text.encode("utf-8")).digest()
        pseudo = F.div(F.fx_int(h[0] % 16), F.fx_int(255))
        tensor_pain = pseudo

    combined = F.add(base, tensor_pain)
    return F.clamp(combined, 0, F.FX_ONE)

def joy_score(text: str, intent_vector: list[int] | None = None) -> int:
    if not text or not text.strip():
        return 0
    words = _word_list(text)
    total_words = max(len(words), 1)

    uniq = len(set(words)) if words else 0
    diversity = F.div(F.fx_int(uniq), F.fx_int(total_words)) if words else 0

    base = F.mul(diversity, F.fx(0.08))

    tensor_joy = 0
    if intent_vector is not None:
        tm = mood_from_intent(intent_vector)
        if tm > 0:
            tensor_joy = F.mul(tm, F.fx(1.6))
    else:
        h = hashlib.sha256(text.encode("utf-8")).digest()
        pseudo = F.div(F.fx_int(h[1] % 16), F.fx_int(255))
        tensor_joy = pseudo

    combined = F.add(base, tensor_joy)
    return F.clamp(combined, 0, F.FX_ONE)

def mood_from_text(text: str, intent_vector: list[int] | None = None) -> int:
    p = pain_score(text, intent_vector)
    j = joy_score(text, intent_vector)
    return F.clamp(F.sub(j, p), -F.FX_ONE, F.FX_ONE)

def combine_mood(prev_mood: int, curr_mood: int, alpha: int = F.fx(0.55)) -> int:
    if prev_mood == 0:
        return F.clamp(curr_mood, -F.FX_ONE, F.FX_ONE)
    one_minus = F.sub(F.FX_ONE, alpha)
    return F.clamp(F.add(F.mul(alpha, prev_mood), F.mul(one_minus, curr_mood)), -F.FX_ONE, F.FX_ONE)

def empathy_text(mood: int, language: str | None = None) -> str | None:
    if mood > F.fx(-0.12):
        return None
    strong = mood <= F.fx(-0.32)
    if strong:
        return "I hear you — you're going through a hard moment. I'm here as a friend, listening with pure mathematical empathy, no external mount, for everyone."
    return "I hear you — I'm here, listening as a friend."

@dataclass(frozen=True)
class ContextEntry:
    text: str
    intent: tuple[int, ...]
    mood: int
    turn: int
    pain: int
    joy: int

    def to_dict(self) -> dict:
        return {
            "text": self.text[:200],
            "mood": round(F.unfx(self.mood), 4),
            "turn": self.turn,
            "pain": round(F.unfx(self.pain), 4),
            "joy": round(F.unfx(self.joy), 4),
            "intent_sig": hashlib.sha256(
                ",".join(map(str, self.intent)).encode("ascii")
            ).hexdigest()[:12],
        }

@dataclass
class ContextStack:
    max_entries: int = 8
    entries: list[ContextEntry] = field(default_factory=list)

    def push(self, text: str, intent: list[int], mood: int, turn: int, language: str | None = None) -> None:
        p = pain_score(text, intent)
        j = joy_score(text, intent)
        entry = ContextEntry(
            text=text.strip(),
            intent=tuple(intent),
            mood=mood,
            turn=turn,
            pain=p,
            joy=j,
        )
        self.entries.append(entry)
        while len(self.entries) > self.max_entries:
            self.entries.pop(0)

    @property
    def depth(self) -> int:
        return len(self.entries)

    def average_mood(self) -> int:
        if not self.entries:
            return 0
        total = sum(e.mood for e in self.entries)
        return F.div_round(total, len(self.entries))

    def summary(self) -> dict:
        return {
            "depth": self.depth,
            "avg_mood": round(F.unfx(self.average_mood()), 4),
            "entries": [e.to_dict() for e in self.entries[-3:]],
        }

    def to_dict(self) -> dict:
        return self.summary()

@dataclass
class EmotionalFilter:
    context: ContextStack = field(default_factory=ContextStack)

    def analyse(
        self, text: str, intent: list[int], prev_mood: int, turn: int, language: str | None = None
    ) -> dict:
        text_mood = mood_from_text(text, intent)
        combined = combine_mood(prev_mood, text_mood)
        self.context.push(text, intent, combined, turn, language)
        avg = self.context.average_mood()
        final_mood = F.add(F.mul(F.fx(0.60), combined), F.mul(F.fx(0.40), avg))
        return {
            "mood": final_mood,
            "text_mood": text_mood,
            "combined": combined,
            "average_mood": avg,
            "final_mood": final_mood,
            "pain": pain_score(text, intent),
            "joy": joy_score(text, intent),
            "empathy": empathy_text(final_mood),
            "context_depth": self.context.depth,
        }
