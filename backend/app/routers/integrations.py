import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import AgentKey, User
from ..rate_limit import enforce_rate_limit

router = APIRouter(prefix="/api/integrations/keys", tags=["agent integrations"])
ALLOWED_SCOPES = {"schedule", "documents", "notes", "ai"}


def browser_user(request: Request, user: User = Depends(get_current_user)) -> User:
    if request.state.agent_key:
        raise HTTPException(403, "Use your browser login to manage agent keys")
    return user


class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] = Field(default=["schedule", "documents"], min_length=1, max_length=4)
    expires_days: int = Field(default=90, ge=1, le=365)

    @field_validator("scopes")
    @classmethod
    def valid_scopes(cls, value):
        if not set(value) <= ALLOWED_SCOPES:
            raise ValueError("Unknown permission")
        return sorted(set(value))


class KeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    prefix: str
    scopes: list[str]
    created_at: datetime
    expires_at: datetime
    revoked: bool


@router.get("", response_model=list[KeyOut])
def list_keys(user: User = Depends(browser_user), db: Session = Depends(get_db)):
    return db.scalars(select(AgentKey).where(AgentKey.user_id == user.id).order_by(AgentKey.id.desc())).all()


@router.post("", status_code=201)
def create_key(payload: KeyCreate, user: User = Depends(browser_user), db: Session = Depends(get_db)):
    enforce_rate_limit(f"agent-key:{user.id}", limit=20, window_seconds=3600)
    token = "studyos_" + secrets.token_urlsafe(32)
    key = AgentKey(user_id=user.id, name=payload.name.strip() or "Agent", scopes=payload.scopes,
                   prefix=token[:16], token_hash=hashlib.sha256(token.encode()).hexdigest(),
                   expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_days))
    db.add(key)
    db.commit()
    db.refresh(key)
    return {**KeyOut.model_validate(key).model_dump(), "token": token}


@router.delete("/{key_id}", status_code=204)
def revoke_key(key_id: int, user: User = Depends(browser_user), db: Session = Depends(get_db)):
    key = db.scalar(select(AgentKey).where(AgentKey.id == key_id, AgentKey.user_id == user.id))
    if key is None:
        raise HTTPException(404, "Agent key not found")
    key.revoked = True
    db.commit()
    return Response(status_code=204)
