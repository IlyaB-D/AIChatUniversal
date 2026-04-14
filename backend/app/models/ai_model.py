from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Integer, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AIModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("ai_providers.id", ondelete="CASCADE"),
        nullable=False
    )

    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_model_name: Mapped[str] = mapped_column(String(120), nullable=False)

    modality: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)

    input_price_per_1m: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    output_price_per_1m: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)

    supports_vision: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supports_files: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    fallback_model_slug: Mapped[str | None] = mapped_column(String(100), nullable=True)

    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_output_tokens: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    temperature: Mapped[float] = mapped_column(Numeric(6, 3), default=0.7, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )