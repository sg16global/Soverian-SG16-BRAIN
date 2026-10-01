"""SG16 BRAIN - durable billing state for the HTTP host.

Issued passes, in-flight Dodo checkouts and webhook replay markers survive a
restart by living in one JSON file.  Pass records are bearer credentials, so
the file is created ``0600`` and every write is atomic: the new content goes to
a temp file in the same directory, is fsynced, then renamed over the old file.

Rules this module keeps:

* serialisation happens while the caller's lock is held, on a private copy of
  the data, so a half-mutated structure is never written;
* a file that cannot be parsed is renamed to ``<name>.corrupt`` (and logged) -
  the host never silently starts empty and then overwrites it;
* if even that rename fails the host refuses to start;
* a failed save is logged and reported through :attr:`last_error`; it never
  raises into the request that triggered it.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path

__all__ = ["BillingStateStore", "BillingStateError", "SCHEMA_VERSION"]

SCHEMA_VERSION = 1
log = logging.getLogger("sg16.billing_state")

#: unpaid checkouts older than this can no longer be confirmed (see the webhook
#: handler's 24h window) and are dropped on load
PENDING_MAX_AGE_SECONDS = 24 * 3600
#: webhook ids only matter inside the signature replay window (5 minutes); keep
#: them far longer than that, then forget them
WEBHOOK_ID_MAX_AGE_SECONDS = 7 * 24 * 3600


class BillingStateError(RuntimeError):
    """The state file is unusable and could not be moved aside."""


def _quarantine(path: Path, reason: str) -> None:
    target = path.with_name(path.name + ".corrupt")
    if target.exists():
        target = path.with_name(f"{path.name}.{int(time.time())}.corrupt")
    try:
        os.replace(path, target)
    except OSError as exc:
        log.critical("billing state %s is unusable (%s) and cannot be moved aside: %s", path, reason, exc)
        raise BillingStateError(
            f"billing state file {path} is unusable ({reason}) and could not be renamed; "
            "refusing to start rather than overwrite it"
        ) from exc
    log.error("billing state %s is unusable (%s); moved to %s and starting empty", path, reason, target)


class BillingStateStore:
    def __init__(self, path: str | os.PathLike) -> None:
        self.path = Path(path)
        self._write_lock = threading.Lock()
        self._seq = 0          # snapshots taken
        self._written_seq = 0  # newest snapshot already on disk
        self.last_error: str | None = None
        self.saves = 0

    # ------------------------------------------------------------------ load
    def load(self, now: float | None = None) -> dict:
        """Read, validate and prune the state file.

        Returns ``{"passes", "pending", "seen_webhooks"}`` (empty when there is
        no file).  ``pending`` aliases are re-linked to one shared dict so a
        status change through either key is seen through both.
        """
        now = time.time() if now is None else now
        empty = {"passes": {}, "pending": {}, "seen_webhooks": {}}
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            return empty
        except OSError as exc:
            _quarantine(self.path, f"unreadable: {exc}")
            return empty
        try:
            data = json.loads(raw.decode("utf-8"))
            if (
                not isinstance(data, dict)
                or data.get("version") != SCHEMA_VERSION
                or not isinstance(data.get("passes"), dict)
                or not isinstance(data.get("pending"), dict)
                or not isinstance(data.get("aliases", {}), dict)
                or not isinstance(data.get("seen_webhooks"), dict)
            ):
                raise ValueError("unexpected structure or version")
            passes = {
                str(k): v for k, v in data["passes"].items()
                if isinstance(v, dict) and isinstance(v.get("expires_at"), (int, float))
            }
            if len(passes) != len(data["passes"]):
                raise ValueError("malformed pass record")
            pending = {str(k): v for k, v in data["pending"].items()}
            if not all(isinstance(v, dict) for v in pending.values()):
                raise ValueError("malformed pending checkout")
            aliases = {str(k): str(v) for k, v in data["aliases"].items()}
            seen = {str(k): int(v) for k, v in data["seen_webhooks"].items()}
        except (UnicodeDecodeError, ValueError, TypeError) as exc:
            _quarantine(self.path, f"corrupt: {exc}")
            return empty

        passes = {k: v for k, v in passes.items() if v["expires_at"] > now}
        pending = {
            k: v for k, v in pending.items()
            if (v.get("status") == "paid" and v.get("record_token") in passes)
            or (v.get("status") != "paid" and now - int(v.get("opened_at", 0)) <= PENDING_MAX_AGE_SECONDS)
        }
        seen = {k: t for k, t in seen.items() if now - t <= WEBHOOK_ID_MAX_AGE_SECONDS}

        linked = dict(pending)
        for alias, primary in aliases.items():
            if primary in pending:
                linked[alias] = pending[primary]
        return {"passes": passes, "pending": linked, "seen_webhooks": seen}

    # ------------------------------------------------------------- snapshot
    def snapshot(self, passes: dict, pending: dict, seen_webhooks: dict) -> tuple[int, str]:
        """Serialise a private copy.  Call this while holding the lock that
        guards the three structures; the returned text is safe to write later.
        """
        primaries: dict[str, dict] = {}
        aliases: dict[str, str] = {}
        for key, entry in pending.items():
            primary = str(entry.get("session_id") or key)
            if primary == key:
                primaries[key] = entry
            else:
                aliases[key] = primary
                primaries.setdefault(primary, entry)
        text = json.dumps(
            {
                "version": SCHEMA_VERSION,
                "passes": passes,
                "pending": primaries,
                "aliases": aliases,
                "seen_webhooks": seen_webhooks,
            },
            sort_keys=True,
        )
        self._seq += 1
        return self._seq, text

    # ---------------------------------------------------------------- write
    def write(self, seq: int, text: str) -> bool:
        """Atomically replace the state file.  Never raises; returns success."""
        with self._write_lock:
            if seq <= self._written_seq:
                return True  # a newer snapshot already reached the disk
            tmp = self.path.with_name(f"{self.path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(text)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(tmp, 0o600)
                os.replace(tmp, self.path)
                self._fsync_dir()
            except OSError as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.error("billing state save failed (%s): %s", self.path, exc)
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                return False
            self._written_seq = seq
            self.saves += 1
            self.last_error = None
            return True

    def _fsync_dir(self) -> None:
        if os.name != "posix":
            return
        fd = os.open(self.path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
