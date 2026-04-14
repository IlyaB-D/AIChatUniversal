from datetime import datetime
from pydantic import BaseModel


class UsageRecordOut(BaseModel):
    id: int
    user_id: int
    chat_id: int | None = None
    message_id: int | None = None

    provider_slug: str
    model_slug: str
    request_type: str

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

    input_cost: float
    output_cost: float
    total_cost: float

    created_at: datetime

    class Config:
        from_attributes = True


class UsageListResponse(BaseModel):
    items: list[UsageRecordOut]


class UsageSummaryResponse(BaseModel):
    total_requests: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    total_input_cost: float
    total_output_cost: float
    total_cost: float