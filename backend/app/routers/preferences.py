import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User, UserPreference

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

ALLOWED_KEYS = {"semester-courses", "exams", "exam-period"}
MAX_VALUE_BYTES = 64_000


class PreferenceInput(BaseModel):
    value: Any = None


def check_key(key: str) -> str:
    if key not in ALLOWED_KEYS:
        raise HTTPException(404, "Unknown preference")
    return key


@router.get("")
def list_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(UserPreference).where(UserPreference.user_id == user.id)).all()
    return {row.key: row.value for row in rows if row.key in ALLOWED_KEYS}


@router.patch("/{key}")
def set_preference(payload: PreferenceInput, key: str = Path(max_length=64), user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    check_key(key)
    if len(json.dumps(payload.value)) > MAX_VALUE_BYTES:
        raise HTTPException(413, "Preference value is too large")
    row = db.scalar(select(UserPreference).where(UserPreference.user_id == user.id, UserPreference.key == key))
    if payload.value is None:
        if row is not None:
            db.delete(row)
            db.commit()
        return {"key": key, "value": None}
    if row is None:
        row = UserPreference(user_id=user.id, key=key, value=payload.value)
        db.add(row)
    else:
        row.value = payload.value
    db.commit()
    return {"key": key, "value": row.value}
