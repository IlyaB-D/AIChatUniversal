from datetime import datetime
from pydantic import BaseModel


class HistoryMessageOut(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    model_slug: str | None = None
    provider_slug: str | None = None
    image_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatHistoryResponse(BaseModel):
    chat_id: int
    items: list[HistoryMessageOut]