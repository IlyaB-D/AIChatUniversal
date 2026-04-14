from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.ai_model import AIModel
from app.models.chat import Chat
from app.schemas.chat import ChatUpdateRequest

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("")
def list_chats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc().nullslast(), Chat.id.desc())
        .all()
    )
    return chats


@router.patch("/{chat_id}")
def update_chat(
    chat_id: int,
    payload: ChatUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if payload.title is None and payload.model_slug is None and payload.system_prompt is None:
        raise HTTPException(
            status_code=400,
            detail="At least one field must be provided for update",
        )

    if payload.model_slug is not None:
        model = (
            db.query(AIModel)
            .filter(
                AIModel.slug == payload.model_slug,
                AIModel.is_active == True,
            )
            .first()
        )

        if not model:
            raise HTTPException(status_code=400, detail="Model not found or inactive")

        chat.model_slug = payload.model_slug

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        chat.title = title

    if payload.system_prompt is not None:
        chat.system_prompt = payload.system_prompt.strip() or None

    db.add(chat)
    db.commit()
    db.refresh(chat)

    return chat


@router.delete("/{chat_id}")
def delete_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    db.delete(chat)
    db.commit()

    return {"ok": True}