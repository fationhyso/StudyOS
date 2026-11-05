import json
import logging
import re
from collections import Counter
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Document, DocumentChunk

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "because", "been", "before", "being", "but", "can",
    "could", "does", "for", "from", "have", "how", "into", "its", "just", "me", "more", "most", "not",
    "our", "out", "please", "should", "some", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "through", "too", "under", "use", "using", "very", "was", "what", "when",
    "where", "which", "while", "who", "why", "will", "with", "would", "you", "your", "summarize", "explain",
}


def tokens(text: str) -> list[str]:
    return [word for word in re.findall(r"[\w'-]+", text.lower()) if len(word) > 2 and word not in STOP_WORDS]


def retrieve_chunks(
    db: Session,
    user_id: int,
    query: str,
    document_ids: list[int] | None = None,
    limit: int = 6,
) -> tuple[list[dict[str, Any]], str]:
    statement = (
        select(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.user_id == user_id, Document.status == "ready")
        .order_by(DocumentChunk.id)
    )
    if document_ids:
        statement = statement.where(Document.id.in_(document_ids))
    rows = db.execute(statement).all()
    query_tokens = Counter(tokens(query))
    ranked = []
    for chunk, document in rows:
        chunk_tokens = Counter(tokens(chunk.content))
        if not chunk_tokens:
            continue
        overlap = sum(min(count, chunk_tokens[token]) for token, count in query_tokens.items())
        phrase_bonus = 4 if query.lower().strip() and query.lower().strip() in chunk.content.lower() else 0
        score = overlap / (len(chunk.content) ** 0.25) + phrase_bonus
        if score > 0:
            ranked.append((score, chunk, document))
    if not ranked and rows:
        selected = [(chunk, document) for chunk, document in rows[:limit]]
    else:
        selected = [(chunk, document) for _, chunk, document in sorted(ranked, key=lambda item: item[0], reverse=True)[:limit]]

    sources = []
    context_parts = []
    for index, (chunk, document) in enumerate(selected, start=1):
        snippet = re.sub(r"\s+", " ", chunk.content).strip()[:320]
        sources.append({
            "document_id": document.id,
            "document_name": document.name,
            "page": chunk.page_number,
            "snippet": snippet,
        })
        context_parts.append(
            f"[{index}] Document: {document.name}, page {chunk.page_number}\n{chunk.content[:2200]}"
        )
    return sources, "\n\n".join(context_parts)


async def call_ai(messages: list[dict[str, str]], json_mode: bool = False) -> str | None:
    settings = get_settings()
    if not settings.ai_api_key:
        return None
    payload: dict[str, Any] = {
        "model": settings.ai_model,
        "messages": messages,
        "temperature": 0.25,
        "max_tokens": 6000 if json_mode else 1800,
    }
    if settings.ai_provider == "deepseek":
        # Bound latency and leave the output budget for answers and schedule JSON.
        payload["thinking"] = {"type": "disabled"}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    try:
        async with httpx.AsyncClient(timeout=75) as client:
            response = await client.post(
                f"{settings.ai_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.ai_api_key}"},
                json=payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return content if isinstance(content, str) and content.strip() else None
    except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        logger.warning("%s AI unavailable; using offline fallback (%s)", settings.ai_provider, type(exc).__name__)
        return None


async def answer_question(
    db: Session,
    user_id: int,
    question: str,
    history: list[dict[str, str]],
    document_ids: list[int],
) -> tuple[str, list[dict[str, Any]], str]:
    sources, context = await retrieve_context(db, user_id, question, document_ids)
    if not context:
        return (
            "I don't have any readable material to reference yet. Upload a PDF, note, or Office document, "
            "wait for indexing to finish, then ask me about it.",
            [],
            "offline",
        )

    system = (
        "You are StudyOS, a careful and encouraging study tutor. Answer using the supplied study-material "
        "excerpts. Cite claims with bracketed source numbers like [1]. Explain difficult ideas clearly, use "
        "short examples or study prompts when useful, and say when the excerpts do not contain enough information. "
        "Never invent citations or facts from the documents."
    )
    messages = [{"role": "system", "content": system}, *history]
    messages.append({"role": "user", "content": f"Question: {question}\n\nStudy material:\n{context}"})
    answer = await call_ai(messages)
    if answer:
        return answer, sources, get_settings().ai_model

    points = []
    for index, source in enumerate(sources[:4], start=1):
        excerpt = source["snippet"].rsplit(" ", 1)[0] if len(source["snippet"]) >= 320 else source["snippet"]
        points.append(f"- {excerpt}… [{index}]")
    answer = (
        "Here are the most relevant passages I found in your study materials:\n\n"
        + "\n".join(points)
        + "\n\n**Offline tutor:** connect DeepSeek or an OpenAI-compatible API for a synthesized explanation. "
        "The passages and citations above are retrieved directly from your files."
    )
    return answer, sources, "offline"


async def retrieve_context(
    db: Session,
    user_id: int,
    question: str,
    document_ids: list[int],
) -> tuple[list[dict[str, Any]], str]:
    return retrieve_chunks(db, user_id, question, document_ids)


async def generate_ai_schedule(documents: list[Document], preferences: dict[str, Any]) -> list[dict[str, Any]] | None:
    material = []
    for document in documents:
        excerpt = document.text[:8000]
        material.append(f"Document ID {document.id}: {document.name}\n{excerpt}")
    prompt = (
        "Create an optimized, realistic study schedule as JSON with one key 'sessions'. Each session must have: "
        "date (YYYY-MM-DD), start_time (HH:MM), duration_minutes (integer), title, topic (study, review, or practice), "
        "notes, and document_id (an integer from the supplied documents, or null). Distribute topics using spaced "
        "repetition and interleaving. Include review and active-recall practice. Do not schedule outside the allowed "
        "dates and weekdays. Keep each day within the requested total minutes including 10-minute breaks between "
        "sessions. Return JSON only.\n\n"
        f"Preferences: {json.dumps(preferences, default=str)}\n\nMaterials:\n" + "\n\n".join(material)[:24_000]
    )
    response = await call_ai(
        [
            {"role": "system", "content": "You are an expert learning scientist and academic planning assistant."},
            {"role": "user", "content": prompt},
        ],
        json_mode=True,
    )
    if not response:
        return None
    try:
        data = json.loads(response)
        sessions = data.get("sessions")
        return sessions if isinstance(sessions, list) and sessions else None
    except (json.JSONDecodeError, AttributeError):
        return None
