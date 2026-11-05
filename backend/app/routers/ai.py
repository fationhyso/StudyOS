from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import ChatMessage, Conversation, Document, User, utcnow
from ..rate_limit import enforce_rate_limit
from ..schemas import ChatRequest, ChatResponse, ConversationOut, MessageOut
from ..services.ai import answer_question

router = APIRouter(prefix="/api/ai", tags=["AI tutor"])


def owned_conversation(conversation_id: int, user: User, db: Session) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)) -> dict:
    settings = get_settings()
    return {
        "provider": settings.ai_provider,
        "configured": bool(settings.ai_api_key),
        "connected": bool(settings.ai_api_key),
        "mode": settings.ai_label if settings.ai_api_key else "Local retrieval",
        "model": settings.ai_model if settings.ai_api_key else None,
    }


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Conversation]:
    return list(db.scalars(
        select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc())
    ).all())


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatMessage]:
    conversation = owned_conversation(conversation_id, user, db)
    return list(db.scalars(
        select(ChatMessage).where(ChatMessage.conversation_id == conversation.id).order_by(ChatMessage.id)
    ).all())


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    conversation = owned_conversation(conversation_id, user, db)
    db.delete(conversation)
    db.commit()
    return Response(status_code=204)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatResponse:
    enforce_rate_limit(f"ai-chat:{user.id}", limit=30, window_seconds=60)
    if payload.document_ids:
        count = len(db.scalars(
            select(Document.id).where(Document.user_id == user.id, Document.id.in_(payload.document_ids))
        ).all())
        if count != len(set(payload.document_ids)):
            raise HTTPException(status_code=400, detail="One or more selected documents are unavailable")

    if payload.conversation_id:
        conversation = owned_conversation(payload.conversation_id, user, db)
    else:
        title = payload.message.strip().replace("\n", " ")[:72]
        conversation = Conversation(user_id=user.id, title=title or "New conversation")
        db.add(conversation)
        db.flush()

    previous = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.id.desc())
        .limit(10)
    ).all()
    history = [{"role": message.role, "content": message.content} for message in reversed(previous)]
    db.add(ChatMessage(conversation_id=conversation.id, role="user", content=payload.message, sources=[]))
    db.commit()

    answer, sources, mode = await answer_question(
        db, user.id, payload.message, history, payload.document_ids
    )
    assistant = ChatMessage(conversation_id=conversation.id, role="assistant", content=answer, sources=sources)
    conversation.updated_at = utcnow()
    db.add(assistant)
    db.commit()
    return ChatResponse(conversation_id=conversation.id, answer=answer, sources=sources, mode=mode)
