"""SG16 BRAIN - engine package.

The in-process mathematical engine.  Nothing in this package may perform
network I/O, spawn a subprocess, or talk to a daemon; ``tests/test_isolation.py``
enforces that mechanically.

Now includes Mistral 7B Apache 2.0 true trained core - 100% real when weights present.
"""

from __future__ import annotations

from .core import DevstralCore, EngineConfig, ReasoningPlan
from .mistral import Mistral7BCore, MistralConfig
from .voxtral import AudioProfile, VoxtralRoute

__all__ = ["DevstralCore", "EngineConfig", "ReasoningPlan", "Mistral7BCore", "MistralConfig", "AudioProfile", "VoxtralRoute"]
