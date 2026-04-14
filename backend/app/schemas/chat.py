from datetime import datetime
from pydantic import BaseModel

class ChatCreateRequest(BaseModel):
    title: str
    model_slug: str | None = None
    system_prompt: str | None = None

class ChatCreateResponse(BaseModel):
    id: int
    user_id: int
    title: str
    model_slug: str
    system_prompt: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatUpdateRequest(BaseModel):
    title: str | None = None
    model_slug: str | None = None
    system_prompt: str | None = None

class ChatUpdateResponse(BaseModel):
    id: int
    user_id: int
    title: str
    model_slug: str
    system_prompt: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ChatSendRequest(BaseModel):
    chat_id: int
    message: str

class MessageOut(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    model_slug: str | None = None
    provider_slug: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatSendResponse(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut

class ModelOut(BaseModel):
    slug: str
    name: str
    provider: str
    modality: str
    supports_vision: bool
    supports_files: bool
    is_active: bool

class ModelsListResponse(BaseModel):
    items: list[ModelOut]

class ChatListItem(BaseModel):
    id: int
    title: str
    model_slug: str
    system_prompt: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ChatsListResponse(BaseModel):
    items: list[ChatListItem]

