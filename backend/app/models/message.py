from datetime import datetime
from sqlalchemy import String, Text, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    role: Mapped[str] = mapped_column(String(20), nullable=False)          # 'user', 'assistant' или 'system'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    provider_slug: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_slug: Mapped[str | None] = mapped_column(String(100), nullable=True)

    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    input_cost: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    output_cost: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    total_cost: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)