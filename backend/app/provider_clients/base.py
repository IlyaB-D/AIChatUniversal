from decimal import Decimal
from pydantic import BaseModel


class AIResponse(BaseModel):
    content: str
    provider_slug: str
    model_slug: str

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    input_cost: Decimal = Decimal("0")
    output_cost: Decimal = Decimal("0")
    total_cost: Decimal = Decimal("0")

    finish_reason: str | None = None
    raw_response: dict | None = None


class BaseAIClient:
    provider_slug: str = "base"

    async def generate(
        self,
        model_slug: str,
        messages: list[dict],
        system_prompt: str | None = None,
        stream: bool = False,
        max_output_tokens: int = 300,
        temperature: float = 0.7,
    ) -> AIResponse:
        raise NotImplementedError