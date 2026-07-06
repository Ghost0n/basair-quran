from __future__ import annotations

from collections import deque
import time

from src.app.core import config

# Paths that get a per-IP sliding-window throttle, mapped to their config bucket.
# Matched exactly (after stripping a trailing slash) so sub-paths like
# ``/api/research-agent/settings`` are intentionally NOT limited.
_LIMITED_PATHS = {
    "/api/auth/login": "auth",
    "/api/auth/signup": "auth",
    "/api/research-agent": "research",
}

# key = (client_ip, bucket) -> monotonic timestamps of recent hits.
_hits: dict[tuple[str, str], deque[float]] = {}


def bucket_for_path(path: str) -> str | None:
    normalized = path.rstrip("/") or path
    return _LIMITED_PATHS.get(normalized)


def reset() -> None:
    """Clear all recorded hits (used by tests for isolation)."""
    _hits.clear()


def check_and_record(client_ip: str, bucket: str, *, now: float | None = None) -> bool:
    """Return True if the request is allowed, recording it against the window.

    A non-positive configured limit disables throttling for the bucket.
    """
    window, limit = config.get_rate_limit(bucket)
    if limit <= 0:
        return True
    moment = time.monotonic() if now is None else now
    key = (client_ip, bucket)
    hits = _hits.get(key)
    if hits is None:
        hits = deque()
        _hits[key] = hits
    threshold = moment - window
    while hits and hits[0] <= threshold:
        hits.popleft()
    if len(hits) >= limit:
        return False
    hits.append(moment)
    return True
