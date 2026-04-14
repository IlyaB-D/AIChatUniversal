from decimal import Decimal
import httpx

from app.core.config import settings
from app.provider_clients.base import BaseAIClient, AIResponse


class ProxyAPIClaudeClient(BaseAIClient):
    provider_slug = "proxyapi"

    def __init__(self) -> None:
        self.settings = settings

    async def generate(
        self,
        model_slug: str,
        messages: list[dict],
        system_prompt: str | None = None,
        stream: bool = False,
        max_output_tokens: int = 300,
        temperature: float = 0.7,
    ) -> AIResponse:
        url = f"{self.settings.PROXYAPI_BASE_URL}/v1/messages"

        headers = {
            "Authorization": f"Bearer {self.settings.PROXYAPI_KEY}",
            "Content-Type": "application/json",
        }

        payload: dict = {
            "model": model_slug,
            "max_tokens": max_output_tokens,
            "messages": messages,
        }

        if system_prompt:
            payload["system"] = system_prompt

        # Anthropic temperature поддерживает float, но можно не передавать при 0/None.
        payload["temperature"] = temperature

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise Exception(f"ProxyAPI Anthropic error {response.status_code}: {response.text}")

        data = response.json()

        text_parts = [
            block.get("text", "")
            for block in data.get("content", [])
            if block.get("type") == "text"
        ]
        result_text = "\n".join(part for part in text_parts if part).strip()

        if not result_text:
            raise Exception(f"No text returned from ProxyAPI Anthropic response: {data}")

        usage = data.get("usage", {})
        prompt_tokens = usage.get("input_tokens", 0)
        completion_tokens = usage.get("output_tokens", 0)
        total_tokens = prompt_tokens + completion_tokens

        return AIResponse(
            content=result_text,
            provider_slug=self.provider_slug,
            model_slug=model_slug,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            input_cost=Decimal("0"),
            output_cost=Decimal("0"),
            total_cost=Decimal("0"),
            raw_response=data,
        )