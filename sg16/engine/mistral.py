"""Experimental Mistral weight inspection and seeded structural-plan code.

This module is not connected to the public chat response path. Its current
``generate_real`` method has no autoregressive inference implementation, and
``plan`` cannot process a loaded real-weight instance. Loading weights here
must not be described as a working conversational model. Seeded mode uses
untrained deterministic matrices only.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import fixed as F
from .. import matrix as M
from ..tensor import Tensor

# Try torch for real inference, optional
try:
    import torch
    HAS_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAS_TORCH = False

# Try safetensors
try:
    from safetensors import safe_open
    HAS_SAFETENSORS = True
except ImportError:
    HAS_SAFETENSORS = False


@dataclass(frozen=True)
class MistralConfig:
    """Shape and local file-path metadata for a Mistral-compatible checkpoint."""
    model_type: str = "mistral"
    hidden_size: int = 4096
    intermediate_size: int = 14336
    num_hidden_layers: int = 32
    num_attention_heads: int = 32
    num_key_value_heads: int = 8
    hidden_act: str = "silu"
    max_position_embeddings: int = 32768
    initializer_range: float = 0.02
    rms_norm_eps: float = 1e-05
    use_cache: bool = True
    rope_theta: float = 10000.0
    sliding_window: int = 4096
    vocab_size: int = 32000
    # SG16 extensions
    head: str = "mistral-7b-apache2"
    seed: str = "sg16.mistral.7b.v1"
    density: str = "experimental-checkpoint-container-not-a-serving-model"
    # Paths
    weight_path: Optional[str] = None  # local path to safetensors or pytorch_model.bin

    @property
    def head_dim(self) -> int:
        return self.hidden_size // self.num_attention_heads

    @property
    def kv_head_dim(self) -> int:
        return self.hidden_size // self.num_attention_heads

    @property
    def num_groups(self) -> int:
        return self.num_attention_heads // self.num_key_value_heads

    @property
    def fingerprint(self) -> str:
        raw = f"{self.model_type}|{self.hidden_size}|{self.intermediate_size}|{self.num_hidden_layers}|{self.num_attention_heads}|{self.num_key_value_heads}|{self.vocab_size}|{self.rope_theta}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def is_real_weights_available(self) -> bool:
        if not self.weight_path:
            return False
        p = Path(self.weight_path)
        if not p.exists():
            return False
        # Check for safetensors or bin
        if p.is_dir():
            # Look for model.safetensors or pytorch_model.bin
            return any((p / f).exists() for f in ["model.safetensors", "pytorch_model.bin", "model-00001-of-00003.safetensors", "consolidated.00.pth"])
        return p.suffix in [".safetensors", ".bin", ".pth"]


def _rms_norm_q16(x: List[int], weight: List[int], eps: int) -> List[int]:
    """
    RMSNorm in Q16.16: y = x / sqrt(mean(x^2)+eps) * weight
    Pure integer math, transport-blind.
    """
    if not x:
        return []
    # mean(x^2)
    acc = 0
    for v in x:
        acc += F.mul(v, v)
    mean_sq = F.div_round(acc, len(x))
    # sqrt(mean_sq + eps)
    denom = F.sqrt(mean_sq + eps)
    if denom == 0:
        denom = F.FX_ONE
    out = []
    for i, v in enumerate(x):
        normed = F.div(v, denom)
        w = weight[i] if i < len(weight) else F.FX_ONE
        out.append(F.mul(normed, w))
    return out


def _rms_norm_float(x, weight, eps=1e-5):
    """
    Floating-point RMSNorm utility for checkpoint tensor experiments.
    x: torch tensor or list float
    """
    if HAS_TORCH and isinstance(x, torch.Tensor):
        # Tensor-based floating-point path
        var = x.pow(2).mean(-1, keepdim=True)
        x_norm = x * torch.rsqrt(var + eps)
        return weight * x_norm
    else:
        # Python float fallback
        mean_sq = sum(v*v for v in x) / len(x)
        denom = math.sqrt(mean_sq + eps)
        if denom == 0:
            denom = 1.0
        return [ (v/denom) * (weight[i] if i < len(weight) else 1.0) for i, v in enumerate(x)]


def _silu_q16(x: int) -> int:
    """SiLU in Q16.16: x * sigmoid(x)"""
    return F.mul(x, F.sigmoid(x))


def _silu_float(x):
    if HAS_TORCH and isinstance(x, torch.Tensor):
        return torch.nn.functional.silu(x)
    else:
        # SiLU = x * sigmoid(x)
        if isinstance(x, list):
            return [v / (1.0 + math.exp(-v)) * v for v in x]  # actually x*sigmoid
        return x / (1.0 + math.exp(-x)) * x if isinstance(x, float) else x


def _rope_q16(x: List[int], pos: int, head_dim: int, theta: float = 10000.0) -> List[int]:
    """
    RoPE in Q16.16 - Rotary Positional Embedding
    Pure integer math, no libm for core path (uses fixed cos/sin)
    """
    # x is flattened head_dim
    out = [0]*len(x)
    for i in range(0, head_dim, 2):
        # freq = 1 / theta^(2i/head_dim)
        # Use fixed-point approximation
        inv_freq = F.div(F.FX_ONE, F.fx(theta ** (i / head_dim))) if i < head_dim else F.FX_ONE
        angle = F.mul(F.fx_int(pos), inv_freq)
        cos_a = F.cos(angle)
        sin_a = F.sin(angle)
        if i+1 < len(x):
            x0 = x[i]
            x1 = x[i+1]
            # rotate
            out[i] = F.sub(F.mul(x0, cos_a), F.mul(x1, sin_a))
            out[i+1] = F.add(F.mul(x0, sin_a), F.mul(x1, cos_a))
        else:
            out[i] = x[i]
    # If longer than head_dim, copy rest (for GQA grouping)
    if len(x) > head_dim:
        for i in range(head_dim, len(x)):
            out[i] = x[i]
    return out


def _rope_float(x, pos: int, head_dim: int, theta: float = 10000.0):
    """
    Floating-point RoPE utility for checkpoint tensor experiments.
    """
    if HAS_TORCH and isinstance(x, torch.Tensor):
        # x shape: [heads, head_dim] or [head_dim]
        # Compute inv_freq
        dim = head_dim
        inv_freq = 1.0 / (theta ** (torch.arange(0, dim, 2, device=x.device, dtype=x.dtype) / dim))
        t = torch.tensor([pos], device=x.device, dtype=x.dtype)
        freqs = torch.outer(t, inv_freq)  # [1, dim/2]
        emb = torch.cat((freqs, freqs), dim=-1)  # [1, dim]
        cos = emb.cos()
        sin = emb.sin()
        # Apply rotary
        # x1 = x[..., ::2], x2 = x[..., 1::2]
        # For simplicity, assume x is [head_dim]
        if x.dim() == 1:
            x1 = x[0::2]
            x2 = x[1::2]
            # Need to handle
            # Use complex rotation
            # Simplified: return x * cos + rotate
            # For full correctness, use torch implementation
            # Here we do basic
            x_rot = torch.empty_like(x)
            x_rot[0::2] = x[0::2] * cos[0, :dim//2] - x[1::2] * sin[0, :dim//2]
            x_rot[1::2] = x[0::2] * sin[0, :dim//2] + x[1::2] * cos[0, :dim//2]
            return x_rot
        else:
            # Multi-head
            # x shape [num_heads, head_dim]
            # Apply per head
            cos = cos.squeeze(0)
            sin = sin.squeeze(0)
            x1 = x[..., 0::2]
            x2 = x[..., 1::2]
            # Need to interleave cos/sin
            # Simplified
            return x  # fallback for now, real impl needs proper broadcasting
    else:
        # Python float fallback
        out = []
        for i in range(0, len(x), 2):
            if i+1 >= len(x):
                out.append(x[i])
                break
            freq = 1.0 / (theta ** (i / head_dim))
            angle = pos * freq
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            x0 = x[i]
            x1 = x[i+1]
            out.append(x0*cos_a - x1*sin_a)
            out.append(x0*sin_a + x1*cos_a)
        return out


class Mistral7BCore:
    """Experimental container for checkpoint inspection and seeded plans.

    Real checkpoint loading does not currently include autoregressive
    generation, and seeded mode uses untrained matrices. SG16Brain does not
    select this component for serving user responses.
    """

    def __init__(self, config: Optional[MistralConfig] = None, small_for_tests: bool = False):
        self.config = config or MistralConfig()
        self.small_for_tests = small_for_tests
        self.is_real = False
        self.weight_origin = "seeded-simulated-sha256-not-trained"

        # For sandbox/tests, use small dimensions to avoid OOM
        if small_for_tests:
            # Small test geometry: dim 64, layers 2, like Devstral but Mistral arch
            self.test_config = MistralConfig(
                hidden_size=64,
                intermediate_size=128,
                num_hidden_layers=2,
                num_attention_heads=8,
                num_key_value_heads=2,
                vocab_size=260,  # byte-level placeholder for tests, not Mistral's tokenizer
                max_position_embeddings=64,
                head="mistral-7b-small-test",
                seed="sg16.mistral.test",
            )
            self._init_seeded(self.test_config)
            return

        # Check for real weights
        if self.config.is_real_weights_available() and HAS_TORCH:
            try:
                self._load_real_weights(self.config.weight_path)
                self.is_real = True
                self.weight_origin = f"checkpoint-tensors-loaded-from-{self.config.weight_path}; provenance-unverified"
            except Exception as e:
                # Fallback to seeded
                print(f"[Mistral7BCore] Real weights load failed {e}, fallback to seeded")
                self._init_seeded(self.config, full_7b=False)  # Use small to avoid OOM
        else:
            # Seeded mode - but for full 7B, generating 7B via SHA256 would OOM/timeout
            # So for pure_mistral without weights in sandbox, we use small config for viability
            # In production with weights, it would be full 7B
            if self.config.hidden_size >= 1024 and not self.config.is_real_weights_available():
                # Avoid OOM in sandbox: use small
                print(f"[Mistral7BCore] No real weights at {self.config.weight_path}, using small seeded for sandbox. In production, download weights via scripts/download_mistral.py")
                small_cfg = MistralConfig(
                    hidden_size=64,
                    intermediate_size=128,
                    num_hidden_layers=2,
                    num_attention_heads=8,
                    num_key_value_heads=2,
                    vocab_size=260,
                    max_position_embeddings=64,
                    head="mistral-7b-seeded-sandbox",
                    seed=self.config.seed,
                    weight_path=self.config.weight_path,
                )
                self._init_seeded(small_cfg)
            else:
                self._init_seeded(self.config)

    def _init_seeded(self, cfg: MistralConfig, full_7b: bool = False):
        """
        Seeded deterministic matrices via SHA256 - same method as DevstralCore
        NOT trained, for testing only.
        """
        self.cfg = cfg
        c = cfg
        # Embed: vocab x hidden
        self._embed = M.build(f"{c.seed}.embed", c.vocab_size, c.hidden_size, F.FX_ONE)
        self._layers = []
        all_mats = [self._embed]
        for li in range(c.num_hidden_layers):
            ls = f"{c.seed}.layer{li}"
            # Attention: q, k, v, o
            # GQA: k and v have num_kv_heads * head_dim = (hidden_size * num_kv_heads / num_heads)
            kv_dim = c.num_key_value_heads * (c.hidden_size // c.num_attention_heads)
            wq = M.build(f"{ls}.wq", c.hidden_size, c.hidden_size, F.fx(0.5))
            wk = M.build(f"{ls}.wk", c.hidden_size, kv_dim, F.fx(0.5))
            wv = M.build(f"{ls}.wv", c.hidden_size, kv_dim, F.fx(0.5))
            wo = M.build(f"{ls}.wo", c.hidden_size, c.hidden_size, F.fx(0.4))
            # MLP SwiGLU: gate, up, down
            w_gate = M.build(f"{ls}.w_gate", c.hidden_size, c.intermediate_size, F.fx(0.6))
            w_up = M.build(f"{ls}.w_up", c.hidden_size, c.intermediate_size, F.fx(0.6))
            w_down = M.build(f"{ls}.w_down", c.intermediate_size, c.hidden_size, F.fx(0.4))
            # Norms
            input_layernorm = M.vector(f"{ls}.input_layernorm", c.hidden_size, F.FX_ONE)
            post_attn_layernorm = M.vector(f"{ls}.post_attn_layernorm", c.hidden_size, F.FX_ONE)
            self._layers.append({
                "wq": wq, "wk": wk, "wv": wv, "wo": wo,
                "w_gate": w_gate, "w_up": w_up, "w_down": w_down,
                "input_layernorm": input_layernorm,
                "post_attn_layernorm": post_attn_layernorm,
            })
            all_mats.extend([wq, wk, wv, wo, w_gate, w_up, w_down])
        self._norm_weight = M.vector(f"{c.seed}.norm", c.hidden_size, F.FX_ONE)
        self.matrix_sha256 = M.fingerprint(*all_mats)
        # Identity inscription (reuse)
        from .. import identity as IDENTITY
        self.identity_inscription = IDENTITY.inscribe(self.matrix_sha256)

    def _load_real_weights(self, weight_path: str):
        """
        Load checkpoint tensors from safetensors or a weights-only PyTorch file.
        This records loaded parameters but does not implement inference or verify provenance.
        """
        p = Path(weight_path)
        if not HAS_TORCH:
            raise RuntimeError("torch required for real Mistral 7B weights, pip install torch")
        self.cfg = self.config
        # For real mode, we keep weights as torch tensors
        self.real_weights: Dict[str, Any] = {}
        if p.is_dir():
            # HuggingFace format: multiple safetensors
            # Find all safetensors
            files = list(p.glob("*.safetensors"))
            if not files and (p / "model.safetensors").exists():
                files = [p / "model.safetensors"]
            if files and HAS_SAFETENSORS:
                for f in files:
                    with safe_open(f, framework="pt", device="cpu") as sf:
                        for k in sf.keys():
                            self.real_weights[k] = sf.get_tensor(k)
            else:
                # Try pytorch_model.bin
                bin_files = list(p.glob("pytorch_model*.bin")) + list(p.glob("*.pth"))
                for bf in bin_files:
                    data = torch.load(bf, map_location="cpu", weights_only=True)
                    self.real_weights.update(data)
        else:
            if p.suffix == ".safetensors" and HAS_SAFETENSORS:
                with safe_open(p, framework="pt", device="cpu") as sf:
                    for k in sf.keys():
                        self.real_weights[k] = sf.get_tensor(k)
            else:
                self.real_weights = torch.load(p, map_location="cpu", weights_only=True)

        # Verify key count for 7B
        print(f"[Mistral7BCore] Loaded {len(self.real_weights)} tensors from {weight_path}")
        # Expect ~300 tensors for 32 layers
        self.matrix_sha256 = hashlib.sha256(str(sorted(self.real_weights.keys())).encode()).hexdigest()
        from .. import identity as IDENTITY
        self.identity_inscription = IDENTITY.inscribe(self.matrix_sha256)

    def _attention_q16(self, x: Tensor, layer: dict, pos: int = 0) -> Tensor:
        """
        GQA + RoPE attention in Q16.16 seeded mode
        """
        c = self.cfg
        # x: rows x hidden
        q = x.matmul(layer["wq"])  # rows x hidden
        k = x.matmul(layer["wk"])  # rows x kv_dim
        v = x.matmul(layer["wv"])  # rows x kv_dim

        # Apply RoPE to q and k
        # For simplicity, apply per row
        q_rows = []
        for r in range(q.rows):
            row = q.row(r)
            # Split into heads: head_dim = hidden/num_heads
            # Apply RoPE per head
            rotated = []
            head_dim = c.hidden_size // c.num_attention_heads
            for h in range(c.num_attention_heads):
                start = h*head_dim
                end = start+head_dim
                head_slice = row[start:end]
                rotated_head = _rope_q16(head_slice, pos+r, head_dim, c.rope_theta)
                rotated.extend(rotated_head)
            q_rows.append(rotated)
        q = Tensor.from_rows(q_rows)

        k_rows = []
        kv_head_dim = c.hidden_size // c.num_attention_heads
        for r in range(k.rows):
            row = k.row(r)
            rotated = []
            for h in range(c.num_key_value_heads):
                start = h*kv_head_dim
                end = start+kv_head_dim
                head_slice = row[start:end]
                rotated_head = _rope_q16(head_slice, pos+r, kv_head_dim, c.rope_theta)
                rotated.extend(rotated_head)
            k_rows.append(rotated)
        k = Tensor.from_rows(k_rows)

        # GQA: repeat kv heads to match num_heads
        # For Q16.16 seeded, simple repeat
        # Attention scores: Q * K^T / sqrt(head_dim)
        scale = F.sqrt(F.fx_int(c.hidden_size // c.num_attention_heads))
        n = x.rows
        # Expand k,v to num_heads groups
        # k is rows x (kv_heads*head_dim), need to expand to rows x (num_heads*head_dim) by repeating
        k_expanded_rows = []
        v_expanded_rows = []
        for r in range(n):
            k_row = k.row(r)
            v_row = v.row(r)
            # Repeat each kv head num_groups times
            k_exp = []
            v_exp = []
            for kv_h in range(c.num_key_value_heads):
                start = kv_h*kv_head_dim
                end = start+kv_head_dim
                kv_slice_k = k_row[start:end]
                kv_slice_v = v_row[start:end]
                for _ in range(c.num_attention_heads // c.num_key_value_heads):
                    k_exp.extend(kv_slice_k)
                    v_exp.extend(kv_slice_v)
            k_expanded_rows.append(k_exp)
            v_expanded_rows.append(v_exp)
        k_exp = Tensor.from_rows(k_expanded_rows)
        v_exp = Tensor.from_rows(v_expanded_rows)

        # Compute attention per head? Simplified: full hidden attention
        q_rows_list = [q.row(i) for i in range(n)]
        k_rows_list = [k_exp.row(i) for i in range(n)]
        v_rows_list = [v_exp.row(i) for i in range(n)]

        out_rows = []
        for i in range(n):
            qi = q_rows_list[i]
            scores = []
            for j in range(n):
                # Dot product
                # Use full hidden dot, then scale
                from ..tensor import dot
                s = dot(qi, k_rows_list[j])
                s = F.div(s, scale)
                scores.append(s)
            probs = F.softmax(scores)
            acc = [0]*c.hidden_size
            for p, vj in zip(probs, v_rows_list):
                if p == 0:
                    continue
                for d in range(c.hidden_size):
                    acc[d] += p * vj[d]
            out_rows.append([F.shr_round(a) for a in acc])
        attn_out = Tensor.from_rows(out_rows)
        # Output projection
        return attn_out.matmul(layer["wo"])

    def _mlp_q16(self, x: Tensor, layer: dict) -> Tensor:
        """
        SwiGLU MLP in Q16.16: gate = silu(X*W_gate), up = X*W_up, down = (gate*up)*W_down
        """
        gate = x.matmul(layer["w_gate"]).apply(lambda v: F.mul(v, F.sigmoid(v)))  # silu
        up = x.matmul(layer["w_up"])
        # Elementwise gate * up
        # Tensor elementwise mul
        # gate and up are same shape
        gated_rows = []
        for r in range(gate.rows):
            g_row = gate.row(r)
            u_row = up.row(r)
            gated_rows.append([F.mul(g, u) for g, u in zip(g_row, u_row)])
        gated = Tensor.from_rows(gated_rows)
        return gated.matmul(layer["w_down"])

    def plan(self, text: str, route: str = "text", transport: str = "unknown"):
        """Build a seeded structural plan; trained-weight inference is unsupported."""
        if self.is_real:
            raise NotImplementedError(
                "Mistral checkpoint inference is not implemented; this component is not a chat model."
            )
        from .core import ReasoningPlan
        import hashlib
        from .. import tokenizer as T

        clipped = text[:8192]
        token_ids = T.encode(clipped)
        # Seeded inspection mode uses bytes; it is not the Mistral tokenizer.
        # Chunking similar to Devstral
        chunk_bytes = 32
        max_chunks = 64
        blocks = [list(token_ids[i:i+chunk_bytes]) for i in range(0, len(token_ids), chunk_bytes)]
        if len(blocks) > max_chunks:
            head = max_chunks//2
            tail = max_chunks-head
            blocks = blocks[:head] + blocks[-tail:]
        if not blocks:
            blocks = [[T.PAD]]

        steps = ["tokenize:utf8-byte"]
        # Embed
        from ..tensor import Tensor, layer_norm, mean_pool
        # Simplified embed chunks
        rows = []
        for block in blocks:
            if not block:
                rows.append([0]*self.cfg.hidden_size)
                continue
            acc = [0]*self.cfg.hidden_size
            for token in block:
                if token < self._embed.rows:
                    row = self._embed.row(token)
                    for i in range(self.cfg.hidden_size):
                        acc[i] += row[i]
            norm = F.sqrt(F.fx_int(len(block)))
            rows.append([F.div(v, norm) for v in acc])
        x = Tensor.from_rows(rows)
        trace = {"embed": x.sha256()}

        # Positional is handled via RoPE in attention, not separate
        steps.append("positional:rope-mistral-theta-10000")
        trace["positional_rope"] = x.sha256()

        # Layers
        for li, layer in enumerate(self._layers):
            # Input layernorm
            x_norm = layer_norm(x)  # simplified, should use rmsnorm with weight
            # Attention
            attn = self._attention_q16(x_norm, layer, pos=li)
            x = x.add(attn)
            x = layer_norm(x)
            steps.append(f"attention:gqa-rope-layer{li+1}-heads{self.cfg.num_attention_heads}-kv{self.cfg.num_key_value_heads}")
            trace[f"attention_{li}"] = attn.sha256()

            # MLP
            x_norm2 = layer_norm(x)
            mlp_out = self._mlp_q16(x_norm2, layer)
            x = x.add(mlp_out)
            x = layer_norm(x)
            steps.append(f"ffn:swiglu-gate-up-down-layer{li+1}-intermediate{self.cfg.intermediate_size}")
            trace[f"ffn_{li}"] = mlp_out.sha256()

        intent = mean_pool(x)
        steps.append("readout:mean-pool-intent-vector-mistral-7b-pure-math")
        trace["intent"] = Tensor.from_vector(intent).sha256()

        # Plan hash
        hasher = hashlib.sha256()
        hasher.update(self.cfg.fingerprint.encode("ascii"))
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
            head=self.cfg.head,
            route=route,
            char_count=len(clipped),
            token_count=len(token_ids),
            chunk_count=len(blocks),
            intent=tuple(intent),
            trace=trace,
            steps=tuple(steps),
            plan_sha256=plan_sha,
            config_fingerprint=self.cfg.fingerprint,
            transport=transport,
        )

    def intent_vector(self, text: str) -> List[int]:
        return self.plan(text).intent_vector

    def generate_real(self, prompt: str, max_new_tokens: int = 100, temperature: float = 0.7) -> str:
        """Placeholder API retained for compatibility; inference is unavailable."""
        raise NotImplementedError(
            "Autoregressive Mistral text generation is not implemented in this build."
        )

    def identity_path(self) -> dict:
        """Identity path for Mistral core - compatible with DevstralCore"""
        from .. import identity as IDENTITY
        # Use intent vector of official name
        vector = self.intent_vector(IDENTITY.OFFICIAL_NAME)
        hasher = hashlib.sha256()
        hasher.update(b"sg16.identity.tensor.mistral")
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
                "route": "mistral-7b" if self.is_real else "mistral-7b-seeded",
                "dim": len(vector),
                "signature": hasher.hexdigest()[:16],
                "weights_loaded": self.is_real,
                "generation_available": False,
                "weight_origin": self.weight_origin,
            },
        }

    def info(self) -> dict:
        return {
            "model_type": self.cfg.model_type,
            "hidden_size": self.cfg.hidden_size,
            "intermediate_size": self.cfg.intermediate_size,
            "num_layers": self.cfg.num_hidden_layers,
            "num_heads": self.cfg.num_attention_heads,
            "num_kv_heads": self.cfg.num_key_value_heads,
            "vocab_size": self.cfg.vocab_size,
            "head": self.cfg.head,
            "fingerprint": self.cfg.fingerprint,
            "matrix_sha256": self.matrix_sha256,
            "weights_loaded": self.is_real,
            "generation_available": False,
            "weight_origin": self.weight_origin,
            "weight_path": self.config.weight_path,
            "has_torch": HAS_TORCH,
            "has_safetensors": HAS_SAFETENSORS,
            "license": "Checkpoint license and provenance are not verified by this module.",
            "architecture": "Configured Mistral-compatible shape; weights are not used for autoregressive inference.",
            "offline_online": "Inference is not implemented.",
        }
