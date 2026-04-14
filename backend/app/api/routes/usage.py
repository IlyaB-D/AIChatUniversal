from sqlalchemy import func
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.usage_record import UsageRecord
from app.schemas.usage import (
    UsageListResponse,
    UsageRecordOut,
    UsageSummaryResponse,
)

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/me", response_model=UsageListResponse)
async def get_my_usage(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    records = (
        db.query(UsageRecord)
        .filter(UsageRecord.user_id == current_user.id)
        .order_by(UsageRecord.created_at.desc(), UsageRecord.id.desc())
        .all()
    )

    return UsageListResponse(
        items=[UsageRecordOut.model_validate(record) for record in records]
    )


@router.get("/me/summary", response_model=UsageSummaryResponse)
async def get_my_usage_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = (
        db.query(
            func.count(UsageRecord.id),
            func.coalesce(func.sum(UsageRecord.prompt_tokens), 0),
            func.coalesce(func.sum(UsageRecord.completion_tokens), 0),
            func.coalesce(func.sum(UsageRecord.total_tokens), 0),
            func.coalesce(func.sum(UsageRecord.input_cost), 0),
            func.coalesce(func.sum(UsageRecord.output_cost), 0),
            func.coalesce(func.sum(UsageRecord.total_cost), 0),
        )
        .filter(UsageRecord.user_id == current_user.id)
        .first()
    )

    return UsageSummaryResponse(
        total_requests=int(result[0] or 0),
        total_prompt_tokens=int(result[1] or 0),
        total_completion_tokens=int(result[2] or 0),
        total_tokens=int(result[3] or 0),
        total_input_cost=float(result[4] or 0),
        total_output_cost=float(result[5] or 0),
        total_cost=float(result[6] or 0),
    )