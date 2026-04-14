from sqlalchemy.orm import Session
from app.models.history_item import HistoryItem
from app.schemas.history import HistoryCreate


def create_history_item(db: Session, data: HistoryCreate) -> HistoryItem:
    item = HistoryItem(
        user_id=data.user_id,
        source=data.source,
        type=data.type,
        model=data.model,
        prompt=data.prompt,
        response_text=data.response_text,
        response_image_url=data.response_image_url,
        is_favorite=data.is_favorite,
        meta=data.meta,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_history_items(db: Session, user_id: int):
    return (
        db.query(HistoryItem)
        .filter(HistoryItem.user_id == user_id)
        .order_by(HistoryItem.created_at.desc())
        .all()
    )