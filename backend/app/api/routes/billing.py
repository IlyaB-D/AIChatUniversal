from app.schemas.billing import BillingUpdateRequest
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.exceptions import AppException
from app.models.user import User
from app.schemas.billing import BillingMeResponse

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("/me", response_model=BillingMeResponse)
async def get_my_billing(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise AppException("User not found", status_code=404)

    total_spent = Decimal(str(user.total_spent_usd or 0))
    limit_value = Decimal(str(user.spending_limit_usd or 0))
    remaining = limit_value - total_spent
    if remaining < 0:
        remaining = Decimal("0")

    return BillingMeResponse(
        user_id=user.id,
        billing_enabled=bool(user.billing_enabled),
        total_spent_usd=float(total_spent),
        spending_limit_usd=float(limit_value),
        remaining_limit_usd=float(remaining),
        limit_reached=bool(total_spent >= limit_value) if user.billing_enabled else False,
    )



@router.patch("/me", response_model=BillingMeResponse)
async def update_my_billing(
    payload: BillingUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise AppException("User not found", status_code=404)

    # Обновляем только переданные поля
    if payload.spending_limit_usd is not None:
        user.spending_limit_usd = payload.spending_limit_usd

    if payload.billing_enabled is not None:
        user.billing_enabled = payload.billing_enabled

    db.commit()
    db.refresh(user)

    total_spent = Decimal(str(user.total_spent_usd or 0))
    limit_value = Decimal(str(user.spending_limit_usd or 0))
    remaining = limit_value - total_spent
    if remaining < 0:
        remaining = Decimal("0")

    return BillingMeResponse(
        user_id=user.id,
        billing_enabled=bool(user.billing_enabled),
        total_spent_usd=float(total_spent),
        spending_limit_usd=float(limit_value),
        remaining_limit_usd=float(remaining),
        limit_reached=bool(total_spent >= limit_value) if user.billing_enabled else False,
    )