from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.ai_model import AIModel
from app.models.chat import Chat
from app.schemas.attachment import AttachmentOut
from app.schemas.chat import (
    ChatCreateRequest,
    ChatCreateResponse,
    ChatSendRequest,
)
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])
chat_service = ChatService()


@router.post("/create", response_model=ChatCreateResponse)
async def create_chat(
    payload: ChatCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    model_slug = payload.model_slug

    if not model_slug:
        default_model = (
            db.query(AIModel)
            .filter(
                AIModel.is_default == True,
                AIModel.is_active == True,
            )
            .order_by(AIModel.priority.asc(), AIModel.id.asc())
            .first()
        )

        if not default_model:
            raise HTTPException(status_code=500, detail="No default model configured")

        model_slug = default_model.slug

    chat = Chat(
        user_id=current_user.id,
        title=payload.title,
        model_slug=model_slug,
        system_prompt=payload.system_prompt or "Отвечай кратко и по делу.",
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.post("/send")
async def send_message(
    payload: ChatSendRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    response = await chat_service.send_message(
        db,
        user_id=current_user.id,
        chat_id=payload.chat_id,
        message_text=payload.message,
    )

    return {
        "user_message": {
            "id": response.user_message.id,
            "chat_id": response.user_message.chat_id,
            "role": response.user_message.role,
            "content": response.user_message.content,
            "model_slug": response.user_message.model_slug,
            "provider_slug": response.user_message.provider_slug,
            "created_at": response.user_message.created_at,
        },
        "assistant_message": {
            "id": response.assistant_message.id,
            "chat_id": response.assistant_message.chat_id,
            "role": response.assistant_message.role,
            "content": response.assistant_message.content,
            "model_slug": response.assistant_message.model_slug,
            "provider_slug": response.assistant_message.provider_slug,
            "created_at": response.assistant_message.created_at,
        },
        "assistant_reply": response.assistant_message.content,
    }


@router.post("/send-with-attachment")
async def send_message_with_attachment(
    chat_id: int = Form(...),
    message: str = Form(...),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    files = [file] if file and file.filename else []

    response, attachments = await chat_service.send_message_with_attachments(
        db,
        user_id=current_user.id,
        chat_id=chat_id,
        message_text=message,
        files=files,
    )

    return {
        "user_message": {
            "id": response.user_message.id,
            "chat_id": response.user_message.chat_id,
            "role": response.user_message.role,
            "content": response.user_message.content,
            "model_slug": response.user_message.model_slug,
            "provider_slug": response.user_message.provider_slug,
            "created_at": response.user_message.created_at,
        },
        "assistant_message": {
            "id": response.assistant_message.id,
            "chat_id": response.assistant_message.chat_id,
            "role": response.assistant_message.role,
            "content": response.assistant_message.content,
            "model_slug": response.assistant_message.model_slug,
            "provider_slug": response.assistant_message.provider_slug,
            "created_at": response.assistant_message.created_at,
        },
        "assistant_reply": response.assistant_message.content,
        "attachments": [
            AttachmentOut.model_validate(attachment).model_dump()
            for attachment in attachments
        ],
    }