from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Document, StudySession, User
from ..rate_limit import enforce_rate_limit
from ..schemas import ScheduleGenerateRequest, StudySessionCreate, StudySessionOut, StudySessionUpdate
from ..services.ai import generate_ai_schedule
from ..services.planner import build_offline_schedule, validate_ai_sessions

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def owned_session(session_id: int, user: User, db: Session) -> StudySession:
    session = db.scalar(select(StudySession).where(StudySession.id == session_id, StudySession.user_id == user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Study session not found")
    return session


def check_document(document_id: int | None, user: User, db: Session) -> None:
    if document_id is not None and not db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    ):
        raise HTTPException(status_code=400, detail="The linked document is not available")


@router.get("", response_model=list[StudySessionOut])
def list_sessions(
    start: date,
    end: date,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudySession]:
    return list(db.scalars(
        select(StudySession)
        .where(StudySession.user_id == user.id, StudySession.date >= start, StudySession.date <= end)
        .order_by(StudySession.date, StudySession.start_minutes)
    ).all())


@router.post("", response_model=StudySessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: StudySessionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudySession:
    check_document(payload.document_id, user, db)
    session = StudySession(user_id=user.id, **payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/{session_id}", response_model=StudySessionOut)
def update_session(
    session_id: int,
    payload: StudySessionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudySession:
    session = owned_session(session_id, user, db)
    changes = payload.model_dump(exclude_unset=True)
    if "document_id" in changes:
        check_document(changes["document_id"], user, db)
    start_minutes = changes.get("start_minutes", session.start_minutes)
    duration_minutes = changes.get("duration_minutes", session.duration_minutes)
    if start_minutes + duration_minutes > 1440:
        raise HTTPException(status_code=422, detail="Study sessions must end by midnight")
    if changes.get("completed") is True and not session.completed:
        session.completed_at = datetime.now(timezone.utc)
    elif changes.get("completed") is False:
        session.completed_at = None
    for field, value in changes.items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    session = owned_session(session_id, user, db)
    db.delete(session)
    db.commit()
    return Response(status_code=204)


@router.post("/generate", response_model=list[StudySessionOut], status_code=status.HTTP_201_CREATED)
async def generate_schedule(
    payload: ScheduleGenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudySession]:
    enforce_rate_limit(f"schedule-generate:{user.id}", limit=10, window_seconds=60)
    query = select(Document).where(Document.user_id == user.id, Document.status == "ready")
    if payload.document_ids:
        query = query.where(Document.id.in_(payload.document_ids))
    documents = list(db.scalars(query).all())
    if payload.document_ids and len(documents) != len(set(payload.document_ids)):
        raise HTTPException(status_code=409, detail="Wait for all selected documents to finish indexing")
    preferences = payload.model_dump()
    raw_sessions = await generate_ai_schedule(documents, preferences)
    planned = validate_ai_sessions(raw_sessions, preferences, [doc.id for doc in documents]) if raw_sessions else None
    if planned is None:
        planned = build_offline_schedule(documents, preferences)
    if not planned:
        raise HTTPException(status_code=400, detail="No study days match these preferences")

    if payload.replace_existing:
        existing = db.scalars(
            select(StudySession).where(
                StudySession.user_id == user.id,
                StudySession.source == "ai",
                StudySession.date >= payload.start_date,
                StudySession.date <= payload.end_date,
            )
        ).all()
        for session in existing:
            db.delete(session)
    sessions = [StudySession(user_id=user.id, source="ai", **values) for values in planned]
    db.add_all(sessions)
    db.commit()
    for session in sessions:
        db.refresh(session)
    return sessions
