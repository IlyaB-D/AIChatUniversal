from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AppException
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None:
        raise AppException("Not authenticated", status_code=401)

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise AppException("Invalid or expired token", status_code=401)

    subject = payload.get("sub")
    token_type = payload.get("type")

    if not subject or token_type != "access":
        raise AppException("Invalid token payload", status_code=401)

    try:
        user_id = int(subject)
    except ValueError:
        raise AppException("Invalid token subject", status_code=401)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise AppException("User not found", status_code=401)

    if not user.is_active:
        raise AppException("User is inactive", status_code=403)

    return user