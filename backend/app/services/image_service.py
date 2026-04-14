from __future__ import annotations

import base64
import uuid
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.exceptions import AppException


class ImageService:
    def __init__(self) -> None:
        self.proxyapi_api_key = settings.PROXYAPI_KEY
        self.proxyapi_openai_base_url = getattr(
            settings,
            "PROXYAPI_OPENAI_BASE_URL",
            "https://api.proxyapi.ru/openai/v1",
        ).rstrip("/")

        self.storage_dir = Path("storage/generated")
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    async def generate_image(
        self,
        prompt: str,
        model: str = "gpt-image-1",
        size: str = "1024x1024",
    ) -> dict:
        if not self.proxyapi_api_key:
            raise AppException(
                "ProxyAPI key is not configured",
                status_code=500,
            )

        if not prompt.strip():
            raise AppException("Prompt is required", status_code=400)

        url = f"{self.proxyapi_openai_base_url}/images/generations"

        payload = {
            "model": model,
            "prompt": prompt,
            "size": size,
        }

        headers = {
            "Authorization": f"Bearer {self.proxyapi_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code >= 400:
            raise AppException(
                f"ProxyAPI image generation failed: {response.text}",
                status_code=502,
            )

        data = response.json()
        items = data.get("data") or []

        if not items:
            raise AppException(
                "ProxyAPI returned empty image data",
                status_code=502,
            )

        first_item = items[0]
        b64_json = first_item.get("b64_json")
        image_url = first_item.get("url")

        if b64_json:
            file_name = f"{uuid.uuid4().hex}.png"
            file_path = self.storage_dir / file_name
            file_path.write_bytes(base64.b64decode(b64_json))

            return {
                "image_url": f"/generated/{file_name}",
                "file_name": file_name,
            }

        if image_url:
            file_name = f"{uuid.uuid4().hex}.png"
            file_path = self.storage_dir / file_name

            async with httpx.AsyncClient(timeout=120.0) as client:
                image_response = await client.get(image_url)

            if image_response.status_code >= 400:
                raise AppException(
                    "Failed to download generated image from provider URL",
                    status_code=502,
                )

            file_path.write_bytes(image_response.content)

            return {
                "image_url": f"/generated/{file_name}",
                "file_name": file_name,
            }

        raise AppException(
            "ProxyAPI did not return b64_json or url",
            status_code=502,
        )