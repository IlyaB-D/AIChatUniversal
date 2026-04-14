# backend/app/repositories/chats.py

from sqlalchemy.orm import Session
from app.models.chat import Chat

class ChatRepository:
    """Работа с таблицей chats."""
    def get_by_id(self, db: Session, chat_id: int) -> Chat | None:
        return db.query(Chat).filter(Chat.id == chat_id).first()