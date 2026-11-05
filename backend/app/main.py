from contextlib import asynccontextmanager
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Document
from .migrations import upgrade_subject_folders
from .routers import ai, auth, dashboard, documents, notes, schedule, integrations, folders
from .services.documents import process_document

settings = get_settings()


def recover_interrupted_documents() -> None:
    with SessionLocal() as db:
        document_ids = list(db.scalars(select(Document.id).where(Document.status == "processing")).all())
    for document_id in document_ids:
        process_document(document_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_directories()
    Base.metadata.create_all(bind=engine)
    upgrade_subject_folders(engine)
    threading.Thread(target=recover_interrupted_documents, name="studyos-index-recovery", daemon=True).start()
    yield


app = FastAPI(
    title="StudyOS API",
    description="Private, self-hosted study workspace with document-aware AI.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


app.include_router(auth.router)
app.include_router(integrations.router)
app.include_router(documents.router)
app.include_router(folders.router)
app.include_router(notes.router)
app.include_router(schedule.router)
app.include_router(ai.router)
app.include_router(dashboard.router)


@app.get("/api/health", tags=["system"])
def health() -> dict:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "app": settings.app_name, "version": "1.0.0"}


static_dir = settings.static_dir.resolve()
if (static_dir / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_workspace(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    if static_dir.is_dir():
        candidate = (static_dir / full_path).resolve()
        if candidate.is_relative_to(static_dir) and candidate.is_file():
            return FileResponse(candidate)
        index = static_dir / "index.html"
        if index.is_file():
            return FileResponse(index)
    return {"name": "StudyOS API", "docs": "/docs", "health": "/api/health"}
