from urllib.parse import quote
import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Note, User
from ..schemas import NoteCreate, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteOut])
def list_notes(
    q: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Note]:
    query = select(Note).where(Note.user_id == user.id)
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.where(or_(Note.title.ilike(term), Note.content.ilike(term)))
    return list(db.scalars(query.order_by(Note.position, Note.updated_at.desc())).all())


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Note:
    position = (db.scalar(select(func.max(Note.position)).where(Note.user_id == user.id)) or -1) + 1
    note = Note(user_id=user.id, title=payload.title.strip() or "Untitled", content=payload.content, position=position)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Note:
    note = db.scalar(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip() or "Untitled"
    for field, value in changes.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    note = db.scalar(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@router.get("/{note_id}/file")
def export_markdown(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    if note is None:
        raise HTTPException(404, "Note not found")
    name = re.sub(r'[\\/\r\n\x00-\x1f]', '_', note.title).strip()[:100] or "Untitled"
    if not name.lower().endswith(".md"):
        name += ".md"
    return Response(content=note.content, media_type="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(name, safe=""),
                             "Cache-Control": "no-store"})
