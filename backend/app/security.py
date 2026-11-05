import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings


def _read_secret(path) -> str:
    value = path.read_text().strip() if path.exists() else ""
    if len(value) < 32:
        raise RuntimeError("JWT secret is missing or too short; refusing to issue tokens")
    return value


def _secret() -> str:
    settings = get_settings()
    if settings.jwt_secret:
        if len(settings.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET must contain at least 32 characters")
        return settings.jwt_secret
    secret_path = settings.data_dir / ".jwt_secret"
    if secret_path.exists():
        return _read_secret(secret_path)

    # Publish a complete secret atomically so crashes or concurrent workers never use a partial key.
    value = secrets.token_urlsafe(48)
    temporary = settings.data_dir / f".jwt_secret.{secrets.token_hex(8)}.tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, secret_path)
        except FileExistsError:
            pass
    finally:
        temporary.unlink(missing_ok=True)
    return _read_secret(secret_path)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=get_settings().jwt_expire_days),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        return None
