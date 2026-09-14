"""SG16 BRAIN - the solution composer (charter invariant ``idea_ingest``).

The brain listens first, then offers a solution; if the solution is not liked it
immediately provides the exact solution the user meant.

This composer builds a *planning scaffold*, not a set of factual claims.  It
extracts the user's own words - the action verb, the subject, the top keywords -
and arranges them into steps.  Nothing here invents facts about the world, which
keeps it compatible with the zero-hallucination invariant: the brain can be
structurally helpful about an idea it has never seen before without asserting
anything it does not know.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .retrieval import HashVectorizer

__all__ = ["IdeaAnalysis", "analyse_idea", "compose_solution"]

from .retrieval import STOPWORDS  # noqa: E402  (single shared list)

ACTION_VERBS = {
    "build": "build",
    "create": "create",
    "make": "make",
    "design": "design",
    "launch": "launch",
    "start": "start",
    "sell": "sell",
    "learn": "learn",
    "write": "write",
    "grow": "grow",
    "fix": "fix",
    "improve": "improve",
    "automate": "automate",
    "teach": "teach",
    "open": "open",
}


@dataclass(frozen=True)
class IdeaAnalysis:
    action: str
    subject: str
    keywords: tuple[str, ...]
    word_count: int
    raw: str

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "subject": self.subject,
            "keywords": list(self.keywords),
            "word_count": self.word_count,
        }


#: Words that describe the act of asking rather than the subject of the idea.
FILLER = frozenset(
    """meant mean want need exact really actually basically just like new one thing way
    help please make try get use look say said good bad much many yes okay ok sure
    version version's""".split()
)


def _keywords(text: str, limit: int = 6, skip_verbs: bool = False) -> list[str]:
    vectorizer = HashVectorizer()
    counts: dict[str, int] = {}
    order: dict[str, int] = {}
    for position, word in enumerate(vectorizer.tokenize(text)):
        if len(word) < 3 or word in STOPWORDS or word.isdigit() or word in FILLER:
            continue
        if skip_verbs and word in ACTION_VERBS:
            continue
        counts[word] = counts.get(word, 0) + 1
        order.setdefault(word, position)
    # frequency first, but ties keep document order so the subject still reads
    # like the sentence the user actually wrote
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], order[kv[0]]))
    return [word for word, _ in ranked[:limit]]


def analyse_idea(text: str) -> IdeaAnalysis:
    """Deterministic extraction of what the user actually said."""
    folded = text.casefold()
    action = "build"
    for verb, canonical in ACTION_VERBS.items():
        if re.search(rf"\b{verb}\b", folded):
            action = canonical
            break

    # the subject must not repeat the action verb ("build build dryer")
    subject_words = _keywords(text, limit=6, skip_verbs=True)[:3]
    idea_order = {w: i for i, w in enumerate(HashVectorizer().tokenize(text))}
    keywords = _keywords(text)
    subject_words.sort(key=lambda w: idea_order.get(w, 0))
    subject = " ".join(subject_words[:3]) if subject_words else "your idea"
    return IdeaAnalysis(
        action=action,
        subject=subject,
        keywords=tuple(keywords),
        word_count=len(folded.split()),
        raw=text.strip(),
    )


def compose_solution(
    idea: str,
    refined: bool = False,
    correction: str | None = None,
    knowledge_note: str | None = None,
) -> dict:
    """Return a structured solution for an ingested idea."""
    analysis = analyse_idea(idea)
    subject = analysis.subject
    action = analysis.action
    first = analysis.keywords[0] if analysis.keywords else "the smallest useful piece"

    if not refined:
        steps = [
            f"Write the one outcome that would make {subject} a success, in a single sentence.",
            f"List what you already have for it: money, time, people, tools, contacts.",
            f"Cut {subject} down to the smallest version you could test within one week.",
            f"Put that small version in front of one real person and write down exactly what broke.",
            f"Fix the first thing that broke, then repeat the test. Do not add features yet.",
        ]
        headline = f"Here is a solution for your idea to {action} {subject}."
        check = (
            f"What I would check first: whether anyone actually needs {subject} today, "
            f"before anything is built for it."
        )
        question = (
            f"One question so the next version is exact: when you say {first!r}, "
            f"what does finished look like to you?"
        )
    else:
        correction_words = _keywords(correction or "", 3)
        # a bare "no, not what I meant" carries no subject, so fall back to the
        # subject of the original idea instead of focusing on a filler word
        focus = (
            " ".join(correction_words)
            if len(correction_words) >= 2
            else " ".join(_keywords(idea, limit=2, skip_verbs=True)) or first
        )
        steps = [
            f"Take {subject} exactly as you described it, and drop everything that is not {focus}.",
            f"State the one change you are asking for, in one line, as a test you can run.",
            f"Do that single change first, and nothing else alongside it.",
            f"Check it against your own words. If it does not match, it is not finished.",
            f"Only then continue with the rest of the plan, one step at a time.",
        ]
        headline = f"Here is the exact version, focused on {focus}."
        check = (
            "What I would check first: that this matches what you described, not what I assumed."
        )
        question = "Is this the version you meant, or is there one detail still missing?"

    body = [headline, ""]
    body.append("Your idea, as I understood it:")
    body.append(f'"{analysis.raw}"' if len(analysis.raw) <= 280 else f'"{analysis.raw[:277]}..."')
    body.append("")
    body.append("Steps:")
    body.extend(f"{i}. {step}" for i, step in enumerate(steps, start=1))
    body.append("")
    body.append(check)
    if knowledge_note:
        body.append("")
        body.append(f"From my own records: {knowledge_note}")
    body.append("")
    body.append(question)

    return {
        "refined": refined,
        "headline": headline,
        "steps": steps,
        "analysis": analysis.to_dict(),
        "text": "\n".join(body),
    }
