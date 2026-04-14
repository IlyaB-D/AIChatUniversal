from decimal import Decimal
import httpx

from app.core.config import settings
from app.provider_clients.base import BaseAIClient, AIResponse


class ProxyAPIOpenAIClient(BaseAIClient):
    provider_slug = "openai"

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
        url = f"{self.settings.PROXYAPI_OPENAI_BASE_URL}/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.settings.PROXYAPI_KEY}",
            "Content-Type": "application/json",
        }

        openai_messages = []

        if system_prompt:
            openai_messages.append(
                {
                    "role": "system",
                    "content": system_prompt,
                }
            )

        openai_messages.extend(messages)

        payload = {
            "model": model_slug,
            "messages": openai_messages,
            "max_tokens": max_output_tokens,
            "temperature": temperature,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise Exception(f"ProxyAPI OpenAI error {response.status_code}: {response.text}")

        data = response.json()

        choices = data.get("choices", [])
        if not choices:
            raise Exception(f"No choices returned from ProxyAPI OpenAI response: {data}")

        message = choices[0].get("message", {})
        content = (message.get("content") or "").strip()

        if not content:
            raise Exception(f"No text returned from ProxyAPI OpenAI response: {data}")

        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

        return AIResponse(
            content=content,
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