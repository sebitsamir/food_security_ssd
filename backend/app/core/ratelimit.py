"""Small in-process sliding-window limiter for the one expensive endpoint.

It protects a single instance. Behind several replicas, enforce the real limit at your gateway
or swap this for a Redis-backed implementation with the same `hit` interface.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from app.core.errors import ProblemError


class RateLimiter:
    def __init__(self, limit: int, window_s: float = 60.0,
                 clock: Callable[[], float] = time.monotonic) -> None:  # fmt: skip
        self.limit, self.window, self._clock = limit, window_s, clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> tuple[bool, float]:
        """Returns (allowed, retry_after_seconds)."""
        now = self._clock()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False, max(0.0, self.window - (now - q[0]))
            q.append(now)
            if len(self._hits) > 10_000:  # bound memory under address churn
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return True, 0.0


def enforce_prediction_limit(request: Request) -> None:
    limiter: RateLimiter = request.app.state.prediction_limiter
    key = request.client.host if request.client else "unknown"
    allowed, retry = limiter.hit(key)
    if not allowed:
        raise ProblemError(429, "Too many requests", "Please slow down and try again shortly.",
                           headers={"Retry-After": str(int(retry) + 1)})  # fmt: skip
