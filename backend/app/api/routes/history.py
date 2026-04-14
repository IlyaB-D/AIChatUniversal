from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.models.chat import Chat
from app.models.message import Message
from app.schemas.history import ChatHistoryResponse, HistoryMessageOut

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/{chat_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise AppException("Chat not found", status_code=404)

    if chat.user_id != current_user.id:
        raise AppException("Access denied", status_code=403)

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )

    return ChatHistoryResponse(
        chat_id=chat_id,
        items=[HistoryMessageOut.model_validate(message) for message in messages],
    )