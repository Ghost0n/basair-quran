"""The moderation worker — runs the checking batches (docs/community-moderation-design.md).

Every ``QBASAIR_MODERATION_INTERVAL_SECONDS`` (15 minutes) it runs
``moderation_service.run_batch``; between batches it checks newly reported
items every ``PRIORITY_SECONDS``. Two ways to run it:

- ``QBASAIR_MODERATION_WORKER=external``: its own process / container,
  ``python -m src.app.workers.moderation_worker`` (the API then doesn't run it);
- ``embedded`` (the default): a daemon thread of the API process
  (:func:`start_embedded`), so a single local process works as is.

A failed run is logged and retried at the next tick; nothing is lost, since the
work lives in the database (queued posts, unchecked comments and reports).
"""

from __future__ import annotations

import logging
import signal
import threading
import time

from src.app.core import config

logger = logging.getLogger(__name__)

PRIORITY_SECONDS = 30
# The first batch waits this long after start, so a restart doesn't hammer the model.
STARTUP_DELAY_SECONDS = 20


def _tick(stop: threading.Event) -> None:
    from src.app.services import app_data_service, moderation_service

    app_data_service.ensure_app_db()
    interval = config.get_moderation_interval_seconds()
    next_batch = time.monotonic() + min(STARTUP_DELAY_SECONDS, interval)
    while not stop.is_set():
        now = time.monotonic()
        try:
            if now >= next_batch:
                result = moderation_service.run_batch()
                next_batch = now + interval
                if result.get("checked"):
                    logger.info("moderation batch: %s", result)
            else:
                result = moderation_service.run_priority()
                if result.get("checked"):
                    logger.info("moderation priority: %s", result)
        except Exception:  # noqa: BLE001 — the loop must survive one bad run
            logger.exception("moderation run failed")
        stop.wait(min(PRIORITY_SECONDS, max(1.0, next_batch - time.monotonic())))


_embedded: tuple[threading.Thread, threading.Event] | None = None


def start_embedded() -> None:
    """Start the batches in a daemon thread of this process (``embedded`` mode)."""
    global _embedded
    if _embedded is not None or config.get_moderation_worker_mode() != "embedded":
        return
    stop = threading.Event()
    thread = threading.Thread(target=_tick, args=(stop,), name="moderation-worker", daemon=True)
    thread.start()
    _embedded = (thread, stop)


def stop_embedded() -> None:
    global _embedded
    if _embedded is None:
        return
    thread, stop = _embedded
    stop.set()
    thread.join(timeout=5)
    _embedded = None


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    stop = threading.Event()
    for name in ("SIGTERM", "SIGINT"):
        signal.signal(getattr(signal, name), lambda *_: stop.set())
    logger.info("moderation worker: a batch every %ss", config.get_moderation_interval_seconds())
    _tick(stop)


if __name__ == "__main__":
    main()
