from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ai_model import AIModel
from app.models.ai_provider import AIProvider
from app.schemas.chat import ModelOut, ModelsListResponse

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelsListResponse)
async def list_models(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AIModel, AIProvider)
        .join(AIProvider, AIModel.provider_id == AIProvider.id)
        .filter(AIModel.is_active == True, AIProvider.is_active == True)
        .order_by(AIModel.priority.asc(), AIModel.id.asc())
        .all()
    )

    items = [
        ModelOut(
            slug=model.slug,
            name=model.name,
            provider=provider.slug,
            modality=model.modality,
            supports_vision=model.supports_vision,
            supports_files=model.supports_files,
            is_active=model.is_active,
        )
        for model, provider in rows
    ]

    return ModelsListResponse(items=items)