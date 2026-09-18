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

from . import identity as identity_mod
from .character import CharacterEngine, Session
from .config import BrainConfig
from .engine.core import DevstralCore, EngineConfig
from .identity import NATIVE_UTTERANCES
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
    "What's your name?",
    "তুমি কে? তোমার নাম কি?",
    "what is the capital of France",
)


class SG16Brain:
    """Sovereign brain: sealed perimeter, one door, in-process mathematics."""

    def __init__(self, config: BrainConfig | None = None) -> None:
        self.config = config or BrainConfig.default()
        self.lexicon = Lexicon()
        # Dual core: Mistral 7B Apache 2.0 real when weights present, Devstral small fallback
        # Brother to brother honest: no fake
        model_type = self.config.engine_model_type
        if "mistral" in model_type.lower():
            try:
                from .engine.mistral import Mistral7BCore
                mistral_cfg = self.config.mistral_engine
                # For tests/sandbox without weights, use small_for_tests to avoid OOM
                # In production with real weights, full 7B will load
                use_small = not mistral_cfg.is_real_weights_available()
                self.core = Mistral7BCore(mistral_cfg, small_for_tests=use_small)
                self.mistral_core = self.core
                self.devstral_core = DevstralCore(self.config.engine)
                # For knowledge indexing, use devstral core if mistral is small test mode
                # to keep backward compat, but prefer mistral core
                self._primary_core_for_knowledge = self.core
            except Exception as e:
                print(f"[SG16Brain] Mistral 7B core init failed {e}, fallback to Devstral small")
                self.core = DevstralCore(self.config.engine)
                self.mistral_core = None
                self.devstral_core = self.core
                self._primary_core_for_knowledge = self.core
        else:
            self.core = DevstralCore(self.config.engine)
            self.mistral_core = None
            self.devstral_core = self.core
            self._primary_core_for_knowledge = self.core

        self.knowledge = KnowledgeBase.load(
            self.config.knowledge_path,
            self.config.knowledge_threshold,
            self.config.knowledge_lexical_floor,
        )
        try:
            self.knowledge.index(self._primary_core_for_knowledge)
        except Exception:
            # Fallback indexing with devstral if mistral indexing fails
            self.knowledge.index(self.devstral_core if hasattr(self, 'devstral_core') else self.core)
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

    def identity(self) -> dict:
        """The designation-protocol handshake payload (Block 7, rule 2) + Master Charter."""
        from .charter import (
            MASTER_CHARTER,
            FUNDAMENTAL_ATTITUDE,
            OWNERSHIP_PHILOSOPHY,
            PERSONALITY_TRAITS,
            HUMAN_DIGNITY_PRINCIPLE,
        )

        path = self.core.identity_path()
        return {
            "designation": self.config.designation,
            "official_name": self.config.official_name,
            "utterance": path["utterance"],
            "fundamental_attitude": FUNDAMENTAL_ATTITUDE,
            "ownership_philosophy": OWNERSHIP_PHILOSOPHY,
            "personality_traits": list(PERSONALITY_TRAITS),
            "human_dignity": HUMAN_DIGNITY_PRINCIPLE,
            "master_charter": {
                "title": MASTER_CHARTER["title"],
                "purpose": MASTER_CHARTER["purpose"],
                "sections": list(MASTER_CHARTER.keys()),
            },
            "native": dict(NATIVE_UTTERANCES),
            "languages": ["universal"],
            "inscription": path["inscription"],
            "tensor": path["tensor"],
            "verified": path["verified"],
        }

    def health(self) -> dict:
        from .charter import PRIVACY_PRINCIPLES, CHILD_SAFETY_PRINCIPLES, EXTREME_HARM_PRINCIPLES

        base = {
            "status": "ready",
            "brain": self.config.name,
            "official_name": self.config.official_name,
            "designation": self.config.designation,
            "identity_sha256": self.core.identity_inscription.digest,
            "identity_verified": identity_mod.verify(
                self.core.matrix_sha256, self.core.identity_inscription.digest
            ),
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
            "privacy": {
                "zero_retention_architecture": "in-memory sessions only, no disk persistence, no hidden dossiers",
                "principles": dict(PRIVACY_PRINCIPLES["stateless_rules"]),
                "honest_claims": PRIVACY_PRINCIPLES["honest_claims"],
                "rejection_retention": PRIVACY_PRINCIPLES["rejection_retention"],
            },
            "child_safety": {
                "boundary": CHILD_SAFETY_PRINCIPLES["boundary"],
                "permanence": CHILD_SAFETY_PRINCIPLES["permanence"],
            },
            "extreme_harm": {
                "protection": EXTREME_HARM_PRINCIPLES["refusal"],
                "intelligent_protection": EXTREME_HARM_PRINCIPLES["goal"],
            },
        }

        # Mistral 7B Apache 2.0 info
        try:
            if hasattr(self, 'mistral_core') and self.mistral_core is not None:
                base["mistral_7b"] = self.mistral_core.info()
            else:
                # Check if core is Mistral
                if hasattr(self.core, 'info'):
                    base["mistral_7b"] = self.core.info()
            # Engine model type
            base["engine_model_type"] = self.config.engine_model_type
            base["engine_weight_path"] = self.config.engine_weight_path
            base["license"] = "Apache 2.0 - SG16 Developer AI Developer Engine by Saif Tech Global LLC"
            base["offline_online"] = "OFFLINE & ONLINE MODE"
        except Exception:
            pass

        return base
