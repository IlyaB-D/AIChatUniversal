from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import AppException
from app.models.ai_model import AIModel
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.schemas.attachment import (
    AttachmentAnalyzeRequest,
    AttachmentAnalyzeResponse,
    AttachmentListResponse,
    AttachmentOut,
    AttachmentUploadResponse,
)
from app.services.ai_router import AIRouter
from app.services.attachment_service import AttachmentService

router = APIRouter(prefix="/attachments", tags=["attachments"])
attachment_service = AttachmentService()
ai_router = AIRouter()

MAX_ATTACHMENTS_PER_CHAT = 20


@router.post("/upload", response_model=AttachmentUploadResponse)
async def upload_attachment(
    chat_id: int = Form(...),
    message_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise AppException("Chat not found", status_code=404)

    existing_count = (
        db.query(Attachment)
        .filter(Attachment.chat_id == chat_id, Attachment.user_id == current_user.id)
        .count()
    )

    if existing_count >= MAX_ATTACHMENTS_PER_CHAT:
        raise AppException(
            f"Too many attachments in this chat (limit {MAX_ATTACHMENTS_PER_CHAT})",
            status_code=400,
        )

    if message_id == 0:
        message_id = None

    attachment = await attachment_service.save_upload(
        db,
        user_id=current_user.id,
        chat_id=chat_id,
        message_id=message_id,
        file=file,
    )

    return AttachmentUploadResponse(
        ok=True,
        attachment=AttachmentOut.model_validate(attachment),
    )


@router.get("/chat/{chat_id}", response_model=AttachmentListResponse)
async def list_chat_attachments(
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
        raise AppException("Chat not found", status_code=404)

    items = attachment_service.list_chat_attachments(
        db,
        user_id=current_user.id,
        chat_id=chat_id,
    )

    return AttachmentListResponse(
        items=[AttachmentOut.model_validate(item) for item in items]
    )


@router.post("/{attachment_id}/analyze", response_model=AttachmentAnalyzeResponse)
async def analyze_attachment(
    attachment_id: int,
    payload: AttachmentAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attachment = (
        db.query(Attachment)
        .filter(Attachment.id == attachment_id, Attachment.user_id == current_user.id)
        .first()
    )
    if not attachment:
        raise AppException("Attachment not found", status_code=404)

    model = (
        db.query(AIModel)
        .filter(
            AIModel.slug == payload.model_slug,
            AIModel.is_active == True,
        )
        .first()
    )
    if not model:
        raise AppException("Model not found or inactive", status_code=404)

    client = ai_router.get_client(db, model.slug)

    system_prompt = (
        "Ты анализируешь один конкретный файл пользователя. "
        "Отвечай кратко, точно и по существу."
    )

    extracted_text = (attachment.extracted_text or "").strip()
    supports_vision = bool(model.supports_vision)

    if extracted_text:
        messages = [
            {
                "role": "user",
                "content": (
                    f"Вопрос пользователя:\n{payload.question}\n\n"
                    f"Файл: {attachment.original_name}\n"
                    f"MIME: {attachment.mime_type}\n\n"
                    f"Извлечённый текст файла:\n{extracted_text[:12000]}"
                ),
            }
        ]
    else:
        image_block = attachment_service.build_single_image_content_block(attachment)

        if supports_vision and image_block:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Вопрос пользователя: {payload.question}\n"
                                f"Проанализируй это изображение."
                            ),
                        },
                        image_block,
                    ],
                }
            ]
        else:
            raise AppException(
                "This attachment has no extracted text and cannot be analyzed by the selected model",
                status_code=400,
            )

    ai_response = await client.generate(
        model_slug=model.api_model_name,
        messages=messages,
        system_prompt=system_prompt,
        stream=False,
        max_output_tokens=model.max_output_tokens,
        temperature=float(model.temperature),
    )

    return AttachmentAnalyzeResponse(
        ok=True,
        attachment_id=attachment.id,
        model_slug=model.slug,
        provider_slug=ai_response.provider_slug,
        answer=ai_response.content,
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attachment = (
        db.query(Attachment)
        .filter(Attachment.id == attachment_id, Attachment.user_id == current_user.id)
        .first()
    )

    if not attachment:
        raise AppException("Attachment not found", status_code=404)

    try:
        file_path = Path(attachment.file_path)
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass

    db.delete(attachment)
    db.commit()

    return {"ok": True}