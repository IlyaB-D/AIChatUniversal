# backend/app/services/usage_service.py

import json
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.usage_record import UsageRecord

class UsageService:
    """Сервис для учёта расхода токенов и стоимости."""

    def record(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int | None,
        message_id: int | None,
        provider_slug: str,
        model_slug: str,
        request_type: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        input_cost: Decimal,
        output_cost: Decimal,
        total_cost: Decimal,
        raw_response: dict | None = None,
    ) -> UsageRecord:
        usage = UsageRecord(
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            provider_slug=provider_slug,
            model_slug=model_slug,
            request_type=request_type,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            input_cost=input_cost,
            output_cost=output_cost,
            total_cost=total_cost,
            raw_response_json=json.dumps(raw_response, ensure_ascii=False) if raw_response else None,
        )
        db.add(usage)
        db.commit()
        db.refresh(usage)
        return usage