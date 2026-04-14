from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "is_active": current_user.is_active,
        "total_spent_usd": float(current_user.total_spent_usd or 0),
        "spending_limit_usd": float(current_user.spending_limit_usd or 0),
        "billing_enabled": bool(current_user.billing_enabled),
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at,
    }