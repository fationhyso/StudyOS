import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import AgentKey, User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    token = credentials.credentials
    request.state.agent_key = None
    if token.startswith("studyos_"):
        key = db.scalar(select(AgentKey).where(AgentKey.token_hash == hashlib.sha256(token.encode()).hexdigest()))
        if key is None or key.revoked or key.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
            raise HTTPException(401, "Agent key is invalid, expired, or revoked")
        resource = request.url.path.split("/")[2]
        if resource == "folders":
            resource = "documents"
        if resource not in key.scopes:
            raise HTTPException(403, "Agent key does not have permission for this resource")
        request.state.agent_key = key
        user_id = key.user_id
    else:
        user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.")
    return user
