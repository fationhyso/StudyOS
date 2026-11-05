from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Document, Note, StudySession, User
from ..schemas import DocumentOut, NoteOut, StudySessionOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_sessions = list(db.scalars(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date >= week_start,
            StudySession.date <= week_end,
        ).order_by(StudySession.date, StudySession.start_minutes)
    ).all())
    today_sessions = [session for session in week_sessions if session.date == today]
    upcoming = list(db.scalars(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
            StudySession.completed.is_(False),
        ).order_by(StudySession.date, StudySession.start_minutes).limit(5)
    ).all())
    completed_dates = set(db.scalars(
        select(StudySession.date).where(
            StudySession.user_id == user.id,
            StudySession.completed.is_(True),
            StudySession.date <= today,
        ).distinct()
    ).all())
    cursor = today if today in completed_dates else today - timedelta(days=1)
    streak = 0
    while cursor in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)

    weekly = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        sessions = [session for session in week_sessions if session.date == day]
        weekly.append({
            "date": day,
            "planned": sum(session.duration_minutes for session in sessions),
            "completed": sum(session.duration_minutes for session in sessions if session.completed),
        })

    recent_notes = list(db.scalars(
        select(Note).where(Note.user_id == user.id).order_by(Note.updated_at.desc()).limit(4)
    ).all())
    recent_documents = list(db.scalars(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()).limit(4)
    ).all())
    note_count = db.scalar(select(func.count(Note.id)).where(Note.user_id == user.id)) or 0
    document_count = db.scalar(select(func.count(Document.id)).where(Document.user_id == user.id)) or 0
    return {
        "date": today,
        "stats": {
            "completed_minutes": sum(s.duration_minutes for s in week_sessions if s.completed),
            "planned_minutes": sum(s.duration_minutes for s in week_sessions),
            "today_sessions": len(today_sessions),
            "today_completed": sum(1 for s in today_sessions if s.completed),
            "streak": streak,
            "notes": note_count,
            "documents": document_count,
        },
        "weekly": weekly,
        "today_sessions": [StudySessionOut.model_validate(s).model_dump(mode="json") for s in today_sessions],
        "upcoming": [StudySessionOut.model_validate(s).model_dump(mode="json") for s in upcoming],
        "recent_notes": [NoteOut.model_validate(n).model_dump(mode="json") for n in recent_notes],
        "recent_documents": [DocumentOut.model_validate(d).model_dump(mode="json") for d in recent_documents],
    }
