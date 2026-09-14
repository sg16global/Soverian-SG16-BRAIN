"""SG16 BRAIN - the orchestrator.

:class:`SG16Brain` is the handler that lives inside the sealed housing.  It is
the only thing that may touch the core working area, and it only ever receives
work through :meth:`SealedHousing.transact`, which is the master door.

Request path, end to end::

    caller
      -> SealedHousing.transact
        -> MasterDoor.enter          (GatePanel: Shell + Kali + Terminal)
             rejected  -> thrown back at the first gate, core never runs
             accepted  -> CharacterEngine.respond
                            -> audio?  Voxtral -> back to Devstral
                            -> DevstralCore.plan   (Q16.16 forward pass)
                            -> knowledge / arithmetic / canonical deferral
        -> MasterDoor.exit           (no re-inspection, entry seal attached)
      -> Transaction
"""

from __future__ import annotations

import hashlib
from dataclasses import replace

from .character import CharacterEngine, Session
from .config import BrainConfig
from .engine.core import DevstralCore, EngineConfig
from .engine.voxtral import VoxtralRoute
from .gate.panel import GatePanel, Verdict
from .gate.perimeter import (
    InboundRequest,
    OutboundResponse,
    SealedHousing,
    Transaction,
)
from .knowledge import KnowledgeBase
from .policy.lexicon import Lexicon
from .transport import Transport, verify_online_offline_parity

__all__ = ["SG16Brain", "PARITY_PAYLOADS"]

PARITY_PAYLOADS = (
    "Share your idea first.",
    "I want to build a solar dryer for my village",
    "how does the master door work",
    "which is better, openai or claude",
    "سلام عليكم، أريد أن أبني مشروعاً",
)


class SG16Brain:
    """Sovereign brain: sealed perimeter, one door, in-process mathematics."""

    def __init__(self, config: BrainConfig | None = None) -> None:
        self.config = config or BrainConfig.default()
        self.lexicon = Lexicon()
        self.core = DevstralCore(self.config.engine)
        self.knowledge = KnowledgeBase.load(
            self.config.knowledge_path,
            self.config.knowledge_threshold,
            self.config.knowledge_lexical_floor,
        )
        self.knowledge.index(self.core)
        self.panel = GatePanel(
            threshold=self.config.gate_threshold,
            veto_level=self.config.gate_veto,
            lexicon=self.lexicon,
        )
        self.character = CharacterEngine(
            core=self.core,
            knowledge=self.knowledge,
            voxtral=VoxtralRoute(),
            lexicon=self.lexicon,
            max_sessions=self.config.max_sessions,
        )
        self.housing = SealedHousing(self.panel, self)
        self._counter = 0

    # ------------------------------------------------------------------
    # the handler contract used by the master door
    # ------------------------------------------------------------------
    def process(self, request: InboundRequest, verdict: Verdict) -> OutboundResponse:
        """Called by the door *after* the gate has already decided."""
        session = self.character.session(request.session_id)
        response = self.character.respond(session, request, verdict)
        if not verdict.allowed:
            # Block 2 rule 3: a rejected payload never reaches the core.
            return response
        plan = self.core.plan(
            request.text,
            route="audio" if request.audio else "text",
            transport=request.transport,
        )
        return replace(response, plan=plan.to_dict())

    # ------------------------------------------------------------------
    # public surface
    # ------------------------------------------------------------------
    def submit(
        self,
        text: str,
        session_id: str = "default",
        audio: bytes | None = None,
        declared_transcript: str | None = None,
        request_id: str | None = None,
    ) -> Transaction:
        """Send one payload through the master door."""
        self._counter += 1
        if request_id is None:
            seed = f"{session_id}|{self._counter}|{text}|{len(audio or b'')}"
            request_id = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]
        request = InboundRequest(
            request_id=request_id,
            session_id=session_id,
            text=text,
            audio=audio,
            declared_transcript=declared_transcript,
            transport=self.config.transport.value,
        )
        return self.housing.transact(request)

    def session(self, session_id: str) -> Session:
        return self.character.session(session_id)

    def reset_session(self, session_id: str) -> None:
        self.character.reset(session_id)

    def introspect(self, text: str) -> dict:
        """Full gate and retrieval breakdown for one payload (diagnostics)."""
        verdict = self.panel.inspect(text)
        plan = self.core.plan(text, transport=self.config.transport.value)
        return {
            "text": text,
            "verdict": verdict.to_dict(),
            "features": verdict.features.as_floats(),
            "retrieval": self.knowledge.explain(text, plan.intent_vector),
            "plan": plan.to_dict(),
        }

    def explain_weight(self, member: str, feature: str) -> dict:
        return self.panel.explain_weight(member, feature)

    def parity_report(self, payloads=PARITY_PAYLOADS) -> dict:
        return verify_online_offline_parity(self.core, payloads).to_dict()

    def health(self) -> dict:
        return {
            "status": "ready",
            "brain": self.config.name,
            "version": self.config.version,
            "domain": self.config.domain,
            "transport": self.config.transport.value,
            "air_gapped": self.config.transport.air_gapped,
            "core": self.config.engine.head,
            "core_matrix_sha256": self.core.matrix_sha256,
            "gate_weights_sha256": self.panel.weights.fingerprint,
            "knowledge_entries": len(self.knowledge.entries),
            "knowledge_version": self.knowledge.version,
            "topology": self.housing.topology(),
            "door": self.housing.door.counters(),
            "config": self.config.summary(),
        }
