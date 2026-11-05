import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Small single-process limiter suitable for the default single-container deployment."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        recent = [timestamp for timestamp in _attempts[key] if timestamp > cutoff]
        if len(recent) >= limit:
            retry_after = max(1, int(window_seconds - (now - recent[0])) + 1)
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        recent.append(now)
        _attempts[key] = recent
        if len(_attempts) > 10_000:
            for stale_key in [item for item, values in _attempts.items() if not values or values[-1] <= cutoff]:
                _attempts.pop(stale_key, None)
