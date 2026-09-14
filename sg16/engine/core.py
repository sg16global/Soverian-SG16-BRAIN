"""SG16 BRAIN - the core working area (Block 2, rule 4).

``DevstralCore`` is the main head controller of the sealed room.  It owns the
byte-tokenization pipeline and the structural processing matrix, and it runs
them as one in-process mathematical function:

    text -> tokens -> byte-block embedding -> +positional basis
         -> LayerNorm -> scaled dot-product self-attention -> +residual
         -> LayerNorm -> tanh feed-forward -> +residual -> LayerNorm
         -> mean-pool -> intent vector

Every number in that chain is a Q16.16 integer, so the *reasoning plan* it
produces is byte-for-byte identical whether the host is online or air-gapped
(Block 3, rule 2).  The plan digest deliberately excludes the transport label:
the transport is metadata about the host, never an input to the mathematics.

When a payload carries audio, :class:`sg16.engine.voxtral.VoxtralRoute`
processes it and returns control here, exactly as rule 4 requires.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Sequence

from .. import fixed as F
from .. import identity as IDENTITY
from .. import matrix as M
from .. import tokenizer as T
from ..tensor import Tensor, cosine, dot, layer_norm, mean_pool

__all__ = ["EngineConfig", "ReasoningPlan", "DevstralCore"]

MAX_INPUT_CHARS = 8192


@dataclass(frozen=True)
class EngineConfig:
    """Fixed geometry of the structural processing matrix."""

    head: str = "devstral-small-2"
    dim: int = 32
    ffn_hidden: int = 64
    chunk_bytes: int = 24
    max_chunks: int = 48
    seed: str = "sg16.core.matrix"

    @property
    def fingerprint(self) -> str:
        return hashlib.sha256(
            f"{self.head}|{self.dim}|{self.ffn_hidden}|{self.chunk_bytes}|"
            f"{self.max_chunks}|{self.seed}".encode("utf-8")
        ).hexdigest()[:16]


@dataclass(frozen=True)
class ReasoningPlan:
    """The verifiable, transport-blind product of one reasoning pass."""

    head: str
    route: str
    char_count: int
    token_count: int
    chunk_count: int
    intent: tuple[int, ...]
    trace: dict[str, str]
    steps: tuple[str, ...]
    plan_sha256: str
    config_fingerprint: str
    transport: str = "unknown"  # metadata only; excluded from plan_sha256

    @property
    def intent_vector(self) -> list[int]:
        return list(self.intent)

    def to_dict(self) -> dict:
        return {
            "head": self.head,
            "route": self.route,
            "transport": self.transport,
            "char_count": self.char_count,
            "token_count": self.token_count,
            "chunk_count": self.chunk_count,
            "intent": [F.unfx(v) for v in self.intent],
            "intent_raw": list(self.intent),
            "trace": dict(self.trace),
            "steps": list(self.steps),
            "plan_sha256": self.plan_sha256,
            "config_fingerprint": self.config_fingerprint,
        }


class DevstralCore:
    """Head controller for all primary logic inside the sealed boundary."""

    def __init__(self, config: EngineConfig | None = None) -> None:
        self.config = config or EngineConfig()
        c = self.config
        # --- structural processing matrix, synthesised in-process ---------
        self._embed = M.build(f"{c.seed}.embed", T.VOCAB_SIZE, c.dim, F.FX_ONE)
        self._wq = M.build(f"{c.seed}.wq", c.dim, c.dim, F.fx(0.5))
        self._wk = M.build(f"{c.seed}.wk", c.dim, c.dim, F.fx(0.5))
        self._wv = M.build(f"{c.seed}.wv", c.dim, c.dim, F.fx(0.5))
        self._wh = M.build(f"{c.seed}.wh", c.dim, c.ffn_hidden, F.fx(0.6))
        self._bh = M.vector(f"{c.seed}.bh", c.ffn_hidden, F.fx(0.1))
        self._wo = M.build(f"{c.seed}.wo", c.ffn_hidden, c.dim, F.fx(0.4))
        self._bo = M.vector(f"{c.seed}.bo", c.dim, F.fx(0.1))
        self._pos = self._positional_basis()
        self._scale = F.sqrt(F.fx_int(c.dim))
        self.matrix_sha256 = M.fingerprint(
            self._embed, self._wq, self._wk, self._wv, self._wh, self._wo
        )
        # --- Block 7 rule 1: the identity inscription ---------------------
        # The core matrix is committed to its own name the moment it exists:
        # a SHA-256 bond between this fingerprint and "Sovereign SG16 Brain".
        # Nothing that does not run this matrix can restate the identity.
        self.identity_inscription = IDENTITY.inscribe(self.matrix_sha256)

    # ------------------------------------------------------------------
    # matrix construction helpers
    # ------------------------------------------------------------------
    def _positional_basis(self) -> list[list[int]]:
        """Integer-period sinusoidal basis.  No floats, no libm.

        Channel ``j`` uses angular step ``1 / (2 + 3j)``, so the whole basis is
        generated from integer division alone.  That keeps the positional
        signal bit-identical across hosts, which the classic ``10000**(j/d)``
        formulation cannot guarantee because it is built with ``pow``.
        """
        basis: list[list[int]] = []
        magnitude = F.fx(0.35)  # positional must stay subordinate to content
        for p in range(self.config.max_chunks):
            row: list[int] = []
            for j in range(self.config.dim):
                step = F.div(F.FX_ONE, F.fx_int(2 + 3 * j))
                angle = F.mul(F.fx_int(p), step)
                value = F.cos(angle) if j % 2 == 0 else F.sin(angle)
                row.append(F.mul(value, magnitude))
            basis.append(row)
        return basis

    # ------------------------------------------------------------------
    # forward pass
    # ------------------------------------------------------------------
    def _chunk_token_ids(self, token_ids: Sequence[int]) -> list[list[int]]:
        size = self.config.chunk_bytes
        limit = self.config.max_chunks
        blocks = [list(token_ids[i : i + size]) for i in range(0, len(token_ids), size)]
        if len(blocks) <= limit:
            return blocks
        # deterministic head+tail truncation: never depends on wall clock
        head = limit // 2
        tail = limit - head
        return blocks[:head] + blocks[-tail:]

    def _embed_chunks(self, blocks: Sequence[Sequence[int]]) -> Tensor:
        rows: list[list[int]] = []
        for block in blocks:
            if not block:
                rows.append([0] * self.config.dim)
                continue
            acc = [0] * self.config.dim
            for token in block:
                row = self._embed.row(token)
                for i in range(self.config.dim):
                    acc[i] += row[i]
            # divide by sqrt(n), not n: byte embeddings are independent and
            # zero-mean, so the block vector must keep unit scale.  Dividing by
            # n collapsed content 24x below the positional basis and made every
            # input look identical in cosine space.
            norm = F.sqrt(F.fx_int(len(block)))
            rows.append([F.div(v, norm) for v in acc])
        return Tensor.from_rows(rows)

    def _attention(self, x: Tensor) -> Tensor:
        q = x.matmul(self._wq)
        k = x.matmul(self._wk)
        v = x.matmul(self._wv)
        n = x.rows
        k_rows = [k.row(i) for i in range(n)]
        v_rows = [v.row(i) for i in range(n)]
        out: list[list[int]] = []
        for i in range(n):
            qi = q.row(i)
            scores = [F.div(dot(qi, kj), self._scale) for kj in k_rows]
            probs = F.softmax(scores)
            acc = [0] * self.config.dim
            for p, vj in zip(probs, v_rows):
                if p == 0:
                    continue
                for d in range(self.config.dim):
                    acc[d] += p * vj[d]
            out.append([F.shr_round(a) for a in acc])
        return Tensor.from_rows(out)

    def _feed_forward(self, x: Tensor) -> Tensor:
        hidden = x.matmul(self._wh).add_vector(self._bh).apply(F.tanh)
        return hidden.matmul(self._wo).add_vector(self._bo)

    def plan(self, text: str, route: str = "text", transport: str = "unknown") -> ReasoningPlan:
        """Run one full reasoning pass and return its verifiable plan."""
        clipped = text[:MAX_INPUT_CHARS]
        token_ids = T.encode(clipped)
        blocks = self._chunk_token_ids(token_ids)
        if not blocks:
            blocks = [[T.PAD]]

        steps: list[str] = ["tokenize:byte-level"]
        x = self._embed_chunks(blocks)
        trace = {"embed": x.sha256()}

        rows = x.rows
        pos = Tensor.from_rows(self._pos[:rows])
        x = x.add(pos)
        steps.append("positional:integer-period-basis")
        trace["positional"] = x.sha256()

        x = layer_norm(x)
        steps.append("layernorm:pre-attention")
        trace["layernorm_1"] = x.sha256()

        ctx = self._attention(x)
        x = layer_norm(x.add(ctx))
        steps.append("attention:scaled-dot-product-single-head")
        trace["attention"] = ctx.sha256()
        trace["layernorm_2"] = x.sha256()

        ff = self._feed_forward(x)
        x = layer_norm(x.add(ff))
        steps.append("ffn:tanh-2layer-residual")
        trace["ffn"] = ff.sha256()
        trace["layernorm_3"] = x.sha256()

        intent = mean_pool(x)
        steps.append("readout:mean-pool-intent-vector")
        trace["intent"] = Tensor.from_vector(intent).sha256()

        hasher = hashlib.sha256()
        hasher.update(self.config.fingerprint.encode("ascii"))
        hasher.update(b"\x1f")
        hasher.update(self.matrix_sha256.encode("ascii"))
        hasher.update(b"\x1f")
        hasher.update(T.token_signature(token_ids).encode("ascii"))
        for name in sorted(trace):
            hasher.update(b"\x1f")
            hasher.update(name.encode("ascii"))
            hasher.update(b"=")
            hasher.update(trace[name].encode("ascii"))
        plan_sha = hasher.hexdigest()

        return ReasoningPlan(
            head=self.config.head,
            route=route,
            char_count=len(clipped),
            token_count=len(token_ids),
            chunk_count=len(blocks),
            intent=tuple(intent),
            trace=trace,
            steps=tuple(steps),
            plan_sha256=plan_sha,
            config_fingerprint=self.config.fingerprint,
            transport=transport,
        )

    # ------------------------------------------------------------------
    # retrieval helpers
    # ------------------------------------------------------------------
    def intent_vector(self, text: str) -> list[int]:
        return self.plan(text).intent_vector

    def identity_path(self) -> dict:
        """Resolve the inscribed identity tensor path (Block 7, rule 1)."""
        vector = self.intent_vector(IDENTITY.OFFICIAL_NAME)
        hasher = hashlib.sha256()
        hasher.update(b"sg16.identity.tensor")
        for value in vector:
            hasher.update(int(value).to_bytes(8, "big", signed=True))
        return {
            "official_name": IDENTITY.OFFICIAL_NAME,
            "designation": IDENTITY.DESIGNATION,
            "utterance": IDENTITY.UTTERANCE,
            "inscription": self.identity_inscription.to_dict(),
            "verified": IDENTITY.verify(
                self.matrix_sha256, self.identity_inscription.digest
            ),
            "tensor": {
                "route": "identity",
                "dim": len(vector),
                "signature": hasher.hexdigest()[:16],
            },
        }

    def similarity(self, plan_a: ReasoningPlan, vector_b: Sequence[int]) -> int:
        """Cosine similarity between an intent vector and another vector."""
        return cosine(list(plan_a.intent), list(vector_b))
