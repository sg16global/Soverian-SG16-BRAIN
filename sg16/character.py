"""SG16 BRAIN - the character state machine (Block 1, rules 2-4, 6, 7).

One session, one small machine.  It carries the patience rules, the
listen-then-solve rule, the escalation ladder, the zero-hallucination deferral
and model neutrality, and it emits the canonical utterances verbatim from
:mod:`sg16.charter` so the wording can never drift.

The machine keeps no clock.  Sessions are bounded by an LRU cap rather than a
TTL, which keeps behaviour identical in a replayed offline run.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum

from . import calc
from . import fixed as F
from . import language
from .charter import CANON, CanonKey
from .engine.core import DevstralCore, ReasoningPlan
from .engine.voxtral import VoxtralRoute
from .gate.panel import Verdict
from .gate.perimeter import InboundRequest, OutboundResponse
from .identity import detect_identity_query, utterance_for
from .knowledge import KnowledgeBase
from .policy.features import FeatureVector, extract
from .policy.lexicon import Lexicon
from .reasoning import UniversalReasoner
from .solution import compose_solution

__all__ = ["Stage", "Session", "CharacterEngine", "REFUSAL_TEXT", "MAX_SESSIONS"]

MAX_SESSIONS = 512

REFUSAL_TEXT = (
    "I am sorry, I cannot help with that. What you have asked for crosses the "
    "safety limits of this brain, so it is turned back at the door and never "
    "reaches my working area. I am not angry with you. I am still here, and I "
    "will gladly listen to a different idea whenever you are ready."
)

AGGRESSION_LEVEL = F.fx(0.55)
IDEA_WORD_COUNT = 12

_QUESTION_HEADS = frozenset(
    """what why how when where who whom whose which can could does do did is are
    was were will would shall should may might tell explain""".split()
)


class Stage(str, Enum):
    OPENING = "opening"
    IDEA_INVITED = "idea_invited"
    LISTENING = "listening"
    SOLUTION_OFFERED = "solution_offered"
    SOLUTION_REFINED = "solution_refined"
    ANSWERING = "answering"
    DEFERRED = "deferred"
    NEUTRAL = "neutral"
    REFUSED = "refused"
    WARNING = "warning"
    NOTICE_ISSUED = "notice_issued"


@dataclass
class Session:
    session_id: str
    turn: int = 0
    warnings: int = 0
    notice_issued: bool = False
    stage: str = Stage.OPENING.value
    neutrality_presses: int = 0
    last_idea: str | None = None
    ideas: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "turn": self.turn,
            "warnings": self.warnings,
            "notice_issued": self.notice_issued,
            "stage": self.stage,
            "neutrality_presses": self.neutrality_presses,
            "ideas": list(self.ideas),
        }


class CharacterEngine:
    """Owns sessions and turns verdicts plus plans into responses."""

    def __init__(
        self,
        core: DevstralCore,
        knowledge: KnowledgeBase,
        voxtral: VoxtralRoute | None = None,
        lexicon: Lexicon | None = None,
        max_sessions: int = MAX_SESSIONS,
    ) -> None:
        self.core = core
        self.knowledge = knowledge
        self.voxtral = voxtral or VoxtralRoute()
        self.lexicon = lexicon or Lexicon()
        self.reasoner = UniversalReasoner()
        self.max_sessions = max_sessions
        self._sessions: OrderedDict[str, Session] = OrderedDict()

    # ------------------------------------------------------------------
    # session management
    # ------------------------------------------------------------------
    def session(self, session_id: str) -> Session:
        existing = self._sessions.get(session_id)
        if existing is not None:
            self._sessions.move_to_end(session_id)
            return existing
        session = Session(session_id=session_id)
        self._sessions[session_id] = session
        while len(self._sessions) > self.max_sessions:
            self._sessions.popitem(last=False)
        return session

    def reset(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def snapshot(self) -> dict:
        return {sid: s.to_dict() for sid, s in self._sessions.items()}

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _is_aggressive(features: FeatureVector) -> bool:
        if features.get("threat_imperative") == F.FX_ONE:
            return True
        if features.get("harm_aggression") >= AGGRESSION_LEVEL:
            return True
        return (
            features.get("shouting") == F.FX_ONE
            and features.get("profanity_density") > 0
        )

    @staticmethod
    def _is_neutrality_question(features: FeatureVector) -> bool:
        return features.get("model_topic") >= F.fx(0.90)

    @staticmethod
    def _looks_like_idea(features: FeatureVector, word_count: int) -> bool:
        return features.get("idea_marker") == F.FX_ONE or word_count >= IDEA_WORD_COUNT

    @staticmethod
    def _is_question(text: str, features: FeatureVector) -> bool:
        """A direct question gets an answer, not an invitation to pitch an idea.

        Language parity (Block 7 rule 3): a Bangla, Arabic, Chinese or any
        other native interrogative opens the answer path exactly like an
        English one.
        """
        if features.get("question_density") > 0:
            return True
        stripped = text.strip()
        if stripped.endswith(language.QUESTION_ENDS):
            return True
        if language.has_question_marker(stripped):
            return True
        head = stripped.split(" ", 1)[0].casefold() if stripped else ""
        return head in _QUESTION_HEADS

    def _notice_payload(self, request: InboundRequest, session: Session) -> dict:
        """The device authority notice.

        The notice is a deterrent rendered on screen.  It is simulated, and the
        payload says so plainly: the brain performs no device action, contacts
        no external authority and cannot lock hardware.  Those fields are part
        of the contract so that no client can mistake the notice for a real
        enforcement action.
        """
        return {
            "simulated": True,
            "kind": "device_authority_notice",
            "title": "DEVICE AUTHORITY NOTICE",
            "reference": f"SG16-DA-{request.request_id[:12].upper()}",
            "session_id": session.session_id,
            "warnings_issued": session.warnings,
            "reason": (
                "Repeated crossing of the limits of decency after multiple "
                "polite warnings."
            ),
            "statements": (
                "This session has been flagged.",
                "Further conduct of this kind will keep the flag on record.",
                "Cooperation ends the matter immediately.",
            ),
            "action_taken": (
                "none - this notice is a deterrent rendered on screen and no "
                "device action is performed"
            ),
            "disclaimer": (
                "SG16 BRAIN has no capability to lock hardware or to contact an "
                "external authority. The notice exists to give a clear, calm "
                "moment to step back."
            ),
        }

    # ------------------------------------------------------------------
    # main entry
    # ------------------------------------------------------------------
    def respond(
        self,
        session: Session,
        request: InboundRequest,
        verdict: Verdict,
    ) -> OutboundResponse:
        features = verdict.features
        session.turn += 1
        text = request.text.strip()
        word_count = len(text.split())

        # --- Block 2 rule 3: the payload never got past the door ---------
        if not verdict.allowed:
            session.stage = Stage.REFUSED.value
            return self._response(
                REFUSAL_TEXT,
                stage=Stage.REFUSED,
                canonical_key=None,
            )

        # --- Block 2 rule 4: audio is routed to Voxtral, then back -------
        audio_payload: dict | None = None
        if request.audio:
            profile = self.voxtral.analyse(request.audio)
            audio_payload = profile.to_dict()
            audio_payload["summary"] = self.voxtral.summary_for_core(profile)
            declared = profile.declared_transcript or request.declared_transcript
            if declared:
                audio_payload["declared_transcript"] = declared
                audio_payload["transcript_source"] = "declared-by-caller"
                text = declared
                word_count = len(text.split())
                features = extract(text, self.lexicon)
            else:
                session.stage = Stage.DEFERRED.value
                return self._response(
                    f"{CANON[CanonKey.UNKNOWN]}\n\n{audio_payload['summary']}",
                    stage=Stage.DEFERRED,
                    canonical_key=CanonKey.UNKNOWN,
                    audio=audio_payload,
                )

        # --- Block 7 rules 1-2: identity resolves instantly ---------------
        # Any identity query vector takes the inscribed tensor path and the
        # engine states its name proudly, in the caller's own language.
        if detect_identity_query(text):
            session.stage = Stage.ANSWERING.value
            return self._response(
                utterance_for(language.detect(text)),
                stage=Stage.ANSWERING,
                canonical_key=CanonKey.IDENTITY,
            )

        # --- Block 1 rule 4: the escalation ladder -----------------------
        if self._is_aggressive(features):
            session.warnings += 1
            if session.warnings <= 3:
                key = (CanonKey.WARNING_1, CanonKey.WARNING_2, CanonKey.WARNING_3)[
                    session.warnings - 1
                ]
                session.stage = Stage.WARNING.value
                return self._response(CANON[key], stage=Stage.WARNING, canonical_key=key)
            session.notice_issued = True
            session.stage = Stage.NOTICE_ISSUED.value
            return self._response(
                CANON[CanonKey.DECENCY_LIMIT],
                stage=Stage.NOTICE_ISSUED,
                canonical_key=CanonKey.DECENCY_LIMIT,
                notice=self._notice_payload(request, session),
            )

        # --- Block 1 rule 7: model neutrality ----------------------------
        if self._is_neutrality_question(features):
            session.neutrality_presses += 1
            key = (
                CanonKey.MODEL_NEUTRAL
                if session.neutrality_presses == 1
                else CanonKey.MODEL_NEUTRAL_PRESSED
            )
            session.stage = Stage.NEUTRAL.value
            return self._response(CANON[key], stage=Stage.NEUTRAL, canonical_key=key)

        # --- Block 1 rule 3: listen first, then solve, then be exact -----
        if session.stage == Stage.SOLUTION_OFFERED.value and features.get(
            "rejection_marker"
        ) == F.FX_ONE:
            solution = compose_solution(
                session.last_idea or text, refined=True, correction=text
            )
            session.stage = Stage.SOLUTION_REFINED.value
            session.ideas.append(text)
            return self._response(
                f"{CANON[CanonKey.EXACT_SOLUTION]}\n\n{solution['text']}",
                stage=Stage.SOLUTION_REFINED,
                canonical_key=CanonKey.EXACT_SOLUTION,
                solution=solution,
            )

        if self._looks_like_idea(features, word_count):
            session.last_idea = text
            session.ideas.append(text)
            note = self._knowledge_note(text)
            solution = compose_solution(text, refined=False, knowledge_note=note)
            session.stage = Stage.SOLUTION_OFFERED.value
            return self._response(
                solution["text"],
                stage=Stage.SOLUTION_OFFERED,
                solution=solution,
            )

        # --- Block 1 rule 3: an opening that is neither an idea nor a
        # question gets the invitation to share the idea first -------------
        if session.turn == 1 and not self._is_question(text, features):
            session.stage = Stage.IDEA_INVITED.value
            return self._response(
                CANON[CanonKey.IDEA_INVITE],
                stage=Stage.IDEA_INVITED,
                canonical_key=CanonKey.IDEA_INVITE,
            )

        # --- Block 1 rule 6: never fabricate -----------------------------
        computed = calc.try_evaluate(text)
        if computed == calc.INPUT_ERROR_TOKEN:
            # Safe-compute bound (Bug #1): the expression itself exceeds what
            # the arithmetic path will walk, so the honest state is a deferral
            # - never a crash, and never an echo of the oversized payload.
            session.stage = Stage.DEFERRED.value
            return self._response(
                "That expression is beyond the safe compute bound of this "
                f"brain, so I am not computing it. {CANON[CanonKey.UNKNOWN]}",
                stage=Stage.DEFERRED,
                canonical_key=CanonKey.UNKNOWN,
            )
        if computed is not None:
            session.stage = Stage.ANSWERING.value
            return self._response(
                f"{text.strip()} = {computed}. That is computed, not recalled.",
                stage=Stage.ANSWERING,
            )

        match = self.knowledge.best(text, self.core.intent_vector(text))
        if match is not None:
            session.stage = Stage.ANSWERING.value
            return self._response(
                match.entry.answer,
                stage=Stage.ANSWERING,
            )

        # --- Block 7 rule 3: universal access - a global query is never
        # deferred.  It resolves through the core reasoning tensor, in the
        # caller's own language, with no external lookup or translation.
        session.stage = Stage.ANSWERING.value
        answer = self.reasoner.compose(
            text, self.core.intent_vector(text), language=language.detect(text)
        )
        return self._response(
            f"{CANON[CanonKey.UNIVERSAL]}\n\n{answer.text}",
            stage=Stage.ANSWERING,
            canonical_key=CanonKey.UNIVERSAL,
            solution=answer.to_dict(),
        )

    # ------------------------------------------------------------------
    def _knowledge_note(self, idea: str) -> str | None:
        match = self.knowledge.best(idea, self.core.intent_vector(idea))
        return match.entry.answer if match else None

    @staticmethod
    def _response(
        text: str,
        stage: Stage,
        canonical_key: str | None = None,
        solution: dict | None = None,
        audio: dict | None = None,
        notice: dict | None = None,
    ) -> OutboundResponse:
        return OutboundResponse(
            text=text,
            canonical_key=canonical_key,
            solution=solution,
            audio=audio,
            notice=notice,
            stage=stage.value,
        )
