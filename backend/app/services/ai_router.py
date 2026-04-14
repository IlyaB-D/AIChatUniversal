from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.ai_model import AIModel
from app.models.ai_provider import AIProvider
from app.provider_clients.base import BaseAIClient
from app.provider_clients.openai_proxyapi import ProxyAPIOpenAIClient
from app.provider_clients.proxyapi_claude import ProxyAPIClaudeClient


class AIRouter:
    def __init__(self) -> None:
        self._proxyapi_claude_client = ProxyAPIClaudeClient()
        self._proxyapi_openai_client = ProxyAPIOpenAIClient()

    def get_client(self, db: Session, model_slug: str) -> BaseAIClient:
        row = (
            db.query(AIModel, AIProvider)
            .join(AIProvider, AIModel.provider_id == AIProvider.id)
            .filter(
                AIModel.slug == model_slug,
                AIModel.is_active == True,
                AIProvider.is_active == True,
            )
            .first()
        )

        if not row:
            raise AppException(f"Model '{model_slug}' not found or inactive", status_code=404)

        model, provider = row

        if provider.slug == "proxyapi":
            return self._proxyapi_claude_client

        if provider.slug == "openai":
            return self._proxyapi_openai_client

        raise AppException(f"Provider '{provider.slug}' is not supported yet", status_code=400)

    def get_default_model(self, db: Session) -> AIModel:
        model = (
            db.query(AIModel)
            .filter(AIModel.is_active == True, AIModel.is_default == True)
            .order_by(AIModel.priority.asc(), AIModel.id.asc())
            .first()
        )

        if model:
            return model

        model = (
            db.query(AIModel)
            .filter(AIModel.is_active == True)
            .order_by(AIModel.priority.asc(), AIModel.id.asc())
            .first()
        )

        if not model:
            raise AppException("No active models configured", status_code=500)

        return model