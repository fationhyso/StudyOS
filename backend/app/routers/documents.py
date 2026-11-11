import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, UploadFile, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Document, DocumentHighlight, User
from ..rate_limit import enforce_rate_limit
from ..schemas import DocumentContent, DocumentOut, DocumentMove, HighlightCreate, HighlightOut
from .folders import owned_folder
from ..services.documents import ALLOWED_EXTENSIONS, process_document

router = APIRouter(prefix="/api/documents", tags=["documents"])

SAFE_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def owned_document(document_id: int, user: User, db: Session) -> Document:
    document = db.scalar(select(Document).where(Document.id == document_id, Document.user_id == user.id))
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("", response_model=list[DocumentOut])
def list_documents(
    q: str = "",
    folder_id: int | None = Query(default=None, ge=1),
    unfiled: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Document]:
    query = select(Document).where(Document.user_id == user.id)
    if folder_id is not None:
        owned_folder(folder_id, user, db)
        query = query.where(Document.folder_id == folder_id)
    elif unfiled:
        query = query.where(Document.folder_id.is_(None))
    if q.strip():
        query = query.where(Document.name.ilike(f"%{q.strip()}%"))
    return list(db.scalars(query.order_by(Document.created_at.desc())).all())


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    folder_id: int | None = Query(default=None, ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    enforce_rate_limit(f"document-upload:{user.id}", limit=30, window_seconds=3600)
    if folder_id is not None:
        owned_folder(folder_id, user, db)
    settings = get_settings()
    original_name = Path(file.filename or "Untitled").name.strip()[:255]
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Supported files: PDF, TXT, MD, images, DOCX, ODT, PPTX, and XLSX")

    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = settings.upload_dir / stored_name
    size = 0
    try:
        with destination.open("xb") as handle:
            while content := await file.read(1024 * 1024):
                size += len(content)
                if size > settings.max_upload_mb * 1024 * 1024:
                    raise HTTPException(status_code=413, detail=f"Files must be smaller than {settings.max_upload_mb} MB")
                handle.write(content)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    document = Document(
        user_id=user.id,
        name=original_name,
        stored_name=stored_name,
        folder_id=folder_id,
        mime_type=SAFE_MIME_TYPES[extension],
        extension=extension,
        size=size,
        status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    background_tasks.add_task(process_document, document.id)
    return document


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    return owned_document(document_id, user, db)


@router.get("/{document_id}/content", response_model=DocumentContent)
def get_document_content(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    return owned_document(document_id, user, db)


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    document = owned_document(document_id, user, db)
    path = get_settings().upload_dir / document.stored_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The original file is no longer available")
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.name,
        content_disposition_type="inline" if document.extension in {".pdf", ".png", ".jpg", ".jpeg", ".webp"} else "attachment",
        headers={"Content-Security-Policy": "default-src 'none'; script-src 'none'; sandbox"},
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    document = owned_document(document_id, user, db)
    path = get_settings().upload_dir / document.stored_name
    db.delete(document)
    db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)


@router.patch("/{document_id}", response_model=DocumentOut)
def move_document(document_id: int, payload: DocumentMove,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Document:
    document = owned_document(document_id, user, db)
    if payload.folder_id is not None:
        owned_folder(payload.folder_id, user, db)
    document.folder_id = payload.folder_id
    db.commit()
    db.refresh(document)
    return document


@router.get("/{document_id}/highlights", response_model=list[HighlightOut])
def list_highlights(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_document(document_id, user, db)
    return db.scalars(select(DocumentHighlight).where(DocumentHighlight.document_id == document_id).order_by(DocumentHighlight.page, DocumentHighlight.id)).all()


@router.post("/{document_id}/highlights", response_model=HighlightOut, status_code=201)
def create_highlight(document_id: int, payload: HighlightCreate,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = owned_document(document_id, user, db)
    if document.extension != ".pdf" or document.status != "ready" or payload.page > document.page_count:
        raise HTTPException(422, "Choose a valid page in a ready PDF")
    enforce_rate_limit(f"pdf-highlight:{user.id}", limit=120, window_seconds=60)
    highlight = DocumentHighlight(document_id=document_id, **payload.model_dump())
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return highlight


@router.delete("/{document_id}/highlights/{highlight_id}", status_code=204)
def delete_highlight(document_id: int, highlight_id: int,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_document(document_id, user, db)
    highlight = db.scalar(select(DocumentHighlight).where(DocumentHighlight.id == highlight_id, DocumentHighlight.document_id == document_id))
    if highlight is None:
        raise HTTPException(404, "Highlight not found")
    db.delete(highlight)
    db.commit()
    return Response(status_code=204)
