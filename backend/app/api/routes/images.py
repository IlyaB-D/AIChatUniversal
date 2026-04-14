from pathlib import Path
import mimetypes

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import AppException
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.repositories.messages import MessageRepository
from app.services.image_service import ImageService

router = APIRouter(prefix="/images", tags=["images"])

image_service = ImageService()
message_repo = MessageRepository()


@router.post("/generate")
async def generate_image(
    prompt: str,
    chat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    prompt = (prompt or "").strip()
    if not prompt:
        raise AppException("Prompt is required", status_code=400)

    chat = (
        db.query(Chat)
        .filter(Chat.id == chat_id, Chat.user_id == current_user.id)
        .first()
    )
    if not chat:
        raise AppException("Chat not found or access denied", status_code=404)

    result = await image_service.generate_image(prompt=prompt)

    image_url = result["image_url"]
    file_name = result["file_name"]

    message = message_repo.create(
        db,
        chat_id=chat_id,
        user_id=None,
        role="assistant",
        content="",
        image_url=image_url,
        model_slug="image-generator",
    )

    file_path = Path("storage/generated") / file_name
    if not file_path.exists():
        raise AppException(
            "Generated file was not found on disk",
            status_code=500,
        )

    mime_type, _ = mimetypes.guess_type(str(file_path))
    mime_type = mime_type or "image/png"

    attachment = Attachment(
        user_id=current_user.id,
        chat_id=chat_id,
        message_id=message.id,
        storage_type="local",
        file_path=str(file_path).replace("\\", "/"),
        original_name=file_name,
        mime_type=mime_type,
        size_bytes=file_path.stat().st_size,
        sha256=None,
        extracted_text=None,
        parse_status="uploaded",
    )

    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return {
        "image_url": image_url,
        "file_name": file_name,
        "message_id": message.id,
        "attachment_id": attachment.id,
    }