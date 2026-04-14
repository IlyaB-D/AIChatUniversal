from datetime import datetime
from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id: int
    user_id: int
    chat_id: int | None = None
    message_id: int | None = None

    storage_type: str
    file_path: str
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str | None = None
    extracted_text: str | None = None
    parse_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class AttachmentUploadResponse(BaseModel):
    ok: bool
    attachment: AttachmentOut


class AttachmentListResponse(BaseModel):
    items: list[AttachmentOut]


class AttachmentAnalyzeRequest(BaseModel):
    question: str = "Проанализируй этот файл и кратко опиши его содержание."
    model_slug: str = "gpt-4.1"


class AttachmentAnalyzeResponse(BaseModel):
    ok: bool
    attachment_id: int
    model_slug: str
    provider_slug: str
    answer: str