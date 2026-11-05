from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Document, SubjectFolder, User
from ..schemas import FolderInput, FolderOut, FolderUpdate

router = APIRouter(prefix="/api/folders", tags=["subject folders"])


def owned_folder(folder_id: int, user: User, db: Session) -> SubjectFolder:
    folder = db.scalar(select(SubjectFolder).where(SubjectFolder.id == folder_id, SubjectFolder.user_id == user.id))
    if folder is None:
        raise HTTPException(404, "Subject folder not found")
    return folder


@router.get("", response_model=list[FolderOut])
def list_folders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(SubjectFolder).where(SubjectFolder.user_id == user.id).order_by(SubjectFolder.name, SubjectFolder.id)).all()


@router.post("", response_model=FolderOut, status_code=201)
def create_folder(payload: FolderInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.parent_id is not None:
        owned_folder(payload.parent_id, user, db)
    folder = SubjectFolder(user_id=user.id, name=payload.name, parent_id=payload.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
def rename_folder(folder_id: int, payload: FolderUpdate,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folder = owned_folder(folder_id, user, db)
    changes = payload.model_dump(exclude_unset=True)
    if "parent_id" in changes and payload.parent_id is not None:
        parent = owned_folder(payload.parent_id, user, db)
        visited = {folder.id}
        while parent is not None:
            if parent.id in visited:
                raise HTTPException(422, "A folder cannot be moved into itself or a descendant")
            visited.add(parent.id)
            parent = owned_folder(parent.parent_id, user, db) if parent.parent_id is not None else None
    for field, value in changes.items():
        setattr(folder, field, value)
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    folder = owned_folder(folder_id, user, db)
    # Folder deletion is organizational: preserve originals, indexes and study references.
    db.execute(update(Document).where(Document.folder_id == folder.id, Document.user_id == user.id).values(folder_id=None))
    db.execute(update(SubjectFolder).where(SubjectFolder.parent_id == folder.id, SubjectFolder.user_id == user.id).values(parent_id=folder.parent_id))
    db.delete(folder)
    db.commit()
    return Response(status_code=204)
