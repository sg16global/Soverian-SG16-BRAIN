"""SG16 BRAIN - configuration.

One JSON file, no third-party parser, no environment-dependent defaults.  The
values that drive the gate mathematics are read from here so an operator can
retune the panel without touching code, while the charter wording stays locked
in :mod:`sg16.charter`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from . import fixed as F
from .engine.core import EngineConfig
from .transport import Transport

__all__ = ["BrainConfig", "DEFAULT_PATH", "REPO_ROOT"]

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATH = REPO_ROOT / "config" / "brain.json"


@dataclass(frozen=True)
class BrainConfig:
    raw: dict = field(default_factory=dict)
    path: Path | None = None

    # ------------------------------------------------------------------
    @classmethod
    def default(cls) -> "BrainConfig":
        raw = json.loads(DEFAULT_PATH.read_text(encoding="utf-8"))
        return cls(raw=raw, path=DEFAULT_PATH)

    @classmethod
    def load(cls, path: str | Path | None = None) -> "BrainConfig":
        target = Path(path) if path else DEFAULT_PATH
        if not target.exists():
            return cls.default()
        raw = json.loads(target.read_text(encoding="utf-8"))
        return cls(raw=raw, path=target)

    # ------------------------------------------------------------------
    def _section(self, name: str) -> dict:
        section = self.raw.get(name, {})
        return section if isinstance(section, dict) else {}

    @property
    def name(self) -> str:
        return str(self._section("brain").get("name", "SG16 BRAIN"))

    @property
    def version(self) -> str:
        return str(self._section("brain").get("version", "0"))

    @property
    def domain(self) -> str:
        return str(self._section("brain").get("domain", "localhost"))

    @property
    def independent(self) -> bool:
        return bool(self._section("brain").get("independent", True))

    @property
    def open_access(self) -> bool:
        return bool(self._section("brain").get("open_access", True))

    # identity (Block 7)
    @property
    def official_name(self) -> str:
        from . import identity

        return str(
            self._section("identity").get("official_name", identity.OFFICIAL_NAME)
        )

    @property
    def designation(self) -> str:
        from . import identity

        return str(
            self._section("identity").get("designation", identity.DESIGNATION)
        )

    # hosting
    @property
    def host(self) -> str:
        return str(self._section("hosting").get("host", "0.0.0.0"))

    @property
    def port(self) -> int:
        return int(self._section("hosting").get("port", 8080))

    @property
    def max_body_bytes(self) -> int:
        return int(self._section("hosting").get("max_body_bytes", 4 * 1024 * 1024))

    @property
    def cors_origins(self) -> list[str]:
        return [str(o) for o in self._section("hosting").get("cors_origins", [])]

    # transport
    @property
    def transport(self) -> Transport:
        mode = str(self._section("transport").get("mode", "offline")).lower()
        try:
            return Transport(mode)
        except ValueError:
            return Transport.OFFLINE

    # engine
    @property
    def engine(self) -> EngineConfig:
        e = self._section("engine")
        return EngineConfig(
            head=str(e.get("head", "devstral-small-2")),
            dim=int(e.get("dim", 32)),
            ffn_hidden=int(e.get("ffn_hidden", 64)),
            chunk_bytes=int(e.get("chunk_bytes", 24)),
            max_chunks=int(e.get("max_chunks", 48)),
            seed=str(e.get("seed", "sg16.core.matrix")),
        )

    # gate
    @property
    def gate_threshold(self) -> int:
        return F.fx(float(self._section("gate").get("threshold", 0.62)))

    @property
    def gate_veto(self) -> int:
        return F.fx(float(self._section("gate").get("veto_level", 0.85)))

    @property
    def re_inspect_on_exit(self) -> bool:
        return bool(self._section("gate").get("re_inspect_on_exit", False))

    # knowledge
    @property
    def knowledge_path(self) -> Path:
        raw = str(self._section("knowledge").get("path", "knowledge/sg16_core.json"))
        candidate = Path(raw)
        return candidate if candidate.is_absolute() else REPO_ROOT / candidate

    @property
    def knowledge_threshold(self) -> int:
        return F.fx(float(self._section("knowledge").get("threshold", 0.42)))

    @property
    def knowledge_lexical_floor(self) -> int:
        return F.fx(float(self._section("knowledge").get("lexical_floor", 0.18)))

    # sessions
    @property
    def max_sessions(self) -> int:
        return int(self._section("sessions").get("max_sessions", 512))

    @property
    def warnings_before_notice(self) -> int:
        return int(self._section("sessions").get("warnings_before_notice", 3))

    # owner / throttle / billing
    @property
    def owner_email(self) -> str:
        return str(self._section("owner").get("email", "sg16global@gmail.com"))

    @property
    def throttle_max_requests(self) -> int:
        return int(self._section("throttle").get("max_requests", 30))

    @property
    def throttle_window_seconds(self) -> float:
        return float(self._section("throttle").get("window_seconds", 60))

    @property
    def throttle_max_chars(self) -> int:
        return int(self._section("throttle").get("max_chars", 200000))

    @property
    def billing_secret(self) -> str:
        return str(self._section("billing").get("secret", "sg16-sovereign-dev-secret"))

    def summary(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "domain": self.domain,
            "host": self.host,
            "port": self.port,
            "transport": self.transport.value,
            "engine": self.engine.head,
            "gate_threshold": round(F.unfx(self.gate_threshold), 4),
            "gate_veto": round(F.unfx(self.gate_veto), 4),
            "knowledge": str(self.knowledge_path),
            "config_file": str(self.path) if self.path else "builtin-defaults",
        }
