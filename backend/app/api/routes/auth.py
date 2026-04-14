from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AppException
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# ВАЖНО:
# Используем pbkdf2_sha256 вместо bcrypt, чтобы избежать проблем с bcrypt backend.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except Exception:
        return False


def hash_password(password: str) -> str:
    password = (password or "").strip()
    if not password:
        raise AppException("Password is required", status_code=400)

    return pwd_context.hash(password)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/register", response_model=TokenResponse)
async def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise AppException("User with this email already exists", status_code=400)

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id)

    return TokenResponse(
        access_token=access_token,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise AppException("Invalid email or password", status_code=401)

    if not verify_password(payload.password, user.password_hash):
        raise AppException("Invalid email or password", status_code=401)

    if not user.is_active:
        raise AppException("User is inactive", status_code=403)

    access_token = create_access_token(user.id)

    return TokenResponse(
        access_token=access_token,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def auth_me(
    current_user: User = Depends(get_current_user),
):
    return UserOut.model_validate(current_user)