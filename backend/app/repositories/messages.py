from sqlalchemy.orm import Session

from app.models.message import Message


class MessageRepository:
    def create(
        self,
        db: Session,
        *,
        chat_id: int,
        user_id: int | None,
        role: str,
        content: str,
        image_url: str | None = None,
        provider_slug: str | None = None,
        model_slug: str | None = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        input_cost=0,
        output_cost=0,
        total_cost=0,
    ) -> Message:
        message = Message(
            chat_id=chat_id,
            user_id=user_id,
            role=role,
            content=content,
            image_url=image_url,
            provider_slug=provider_slug,
            model_slug=model_slug,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            input_cost=input_cost,
            output_cost=output_cost,
            total_cost=total_cost,
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        return message

    def list_by_chat(self, db: Session, chat_id: int) -> list[Message]:
        return (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.created_at.asc(), Message.id.asc())
            .all()
        )

    def get_by_id(self, db: Session, message_id: int) -> Message | None:
        return db.query(Message).filter(Message.id == message_id).first()