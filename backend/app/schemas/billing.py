from pydantic import BaseModel
from typing import Optional


class BillingMeResponse(BaseModel):
    user_id: int
    billing_enabled: bool
    total_spent_usd: float
    spending_limit_usd: float
    remaining_limit_usd: float
    limit_reached: bool


class BillingUpdateRequest(BaseModel):
    spending_limit_usd: Optional[float] = None
    billing_enabled: Optional[bool] = None