import logging
import re
from pathlib import Path
from zipfile import ZipFile

import pytesseract
from docx import Document as DocxDocument
from openpyxl import load_workbook
from PIL import Image
from pypdf import PdfReader
from pptx import Presentation

from ..config import get_settings
from ..database import SessionLocal
from ..models import Document, DocumentChunk

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".docx",
    ".pptx",
    ".xlsx",
}


def extract_pages(path: Path, extension: str) -> list[str]:
    if extension in {".docx", ".pptx", ".xlsx"}:
        with ZipFile(path) as archive:
            if len(archive.infolist()) > 5000 or sum(item.file_size for item in archive.infolist()) > 150 * 1024 * 1024:
                raise ValueError("Expanded Office document exceeds the 150 MB safety limit")
    if extension == ".pdf":
        reader = PdfReader(path)
        if len(reader.pages) > 400:
            raise ValueError("PDF exceeds the 400-page safety limit")
        return [(page.extract_text() or "").strip() for page in reader.pages]
    if extension in {".txt", ".md"}:
        return [path.read_text(encoding="utf-8", errors="replace")]
    if extension in {".png", ".jpg", ".jpeg", ".webp"}:
        with Image.open(path) as image:
            if image.width * image.height > 40_000_000:
                raise ValueError("Image exceeds the 40-megapixel safety limit")
            return [pytesseract.image_to_string(image, timeout=30).strip()]
    if extension == ".docx":
        document = DocxDocument(path)
        parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text for cell in row.cells))
        return ["\n".join(parts)]
    if extension == ".pptx":
        presentation = Presentation(path)
        pages = []
        for index, slide in enumerate(presentation.slides, start=1):
            text = [shape.text for shape in slide.shapes if hasattr(shape, "text") and shape.text.strip()]
            pages.append(f"Slide {index}\n" + "\n".join(text))
        return pages
    if extension == ".xlsx":
        workbook = load_workbook(path, read_only=True, data_only=True)
        pages = []
        for sheet in workbook.worksheets:
            rows = []
            for row in sheet.iter_rows(values_only=True):
                values = [str(value) for value in row if value is not None]
                if values:
                    rows.append(" | ".join(values))
            pages.append(f"Sheet: {sheet.title}\n" + "\n".join(rows))
        workbook.close()
        return pages
    raise ValueError("This file type is not supported")


def chunk_text(text: str, size: int = 1100, overlap: int = 160) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text).strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if boundary > start + size // 2:
                end = boundary + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def process_document(document_id: int) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        if document is None:
            return
        try:
            pages = extract_pages(settings.upload_dir / document.stored_name, document.extension)
            pages = [re.sub(r"\x00", "", page) for page in pages]
            if len(pages) > 500:
                raise ValueError("Document exceeds the 500-section safety limit")
            full_text = "\n\n".join(page for page in pages if page)
            if len(full_text) > 3_000_000:
                raise ValueError("Extracted text exceeds the 3 MB safety limit")
            document.pages = pages
            document.text = full_text
            document.page_count = len(pages)
            document.status = "ready"
            document.error = None
            for page_number, page in enumerate(pages, start=1):
                for chunk_index, content in enumerate(chunk_text(page)):
                    db.add(
                        DocumentChunk(
                            document_id=document.id,
                            chunk_index=chunk_index,
                            page_number=page_number,
                            content=content,
                        )
                    )
            db.commit()
        except Exception:  # Parsing failures must be visible without leaking internals.
            logger.exception("Could not process document %s", document_id)
            db.rollback()
            document = db.get(Document, document_id)
            if document is not None:
                document.status = "error"
                document.error = "We couldn't read this file. It may be encrypted, corrupted, or exceed a processing safety limit."
                db.commit()
