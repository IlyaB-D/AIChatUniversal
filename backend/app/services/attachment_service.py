import base64
import hashlib
import os
from pathlib import Path

from docx import Document
from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.models.attachment import Attachment


class AttachmentService:
    def __init__(self) -> None:
        self.base_upload_dir = Path("storage/uploads")
        self.supported_vision_mime_types = {
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
            "image/gif",
        }
        self.allowed_mime_types = {
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
            "image/gif",
            "application/pdf",
            "text/plain",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        self.max_file_size_mb = int(getattr(settings, "MAX_UPLOAD_SIZE_MB", 10))
        self.max_file_size_bytes = self.max_file_size_mb * 1024 * 1024

    def _ensure_upload_dir(self) -> None:
        self.base_upload_dir.mkdir(parents=True, exist_ok=True)

    def _build_safe_filename(self, original_name: str) -> str:
        safe_name = original_name.replace("\\", "_").replace("/", "_").strip()
        if not safe_name:
            safe_name = "file.bin"
        return safe_name

    def _calculate_sha256_from_bytes(self, content: bytes) -> str:
        sha256 = hashlib.sha256()
        sha256.update(content)
        return sha256.hexdigest()

    def _extract_text_from_txt(self, file_path: Path) -> str:
        return file_path.read_text(encoding="utf-8", errors="ignore").strip()

    def _extract_text_from_pdf(self, file_path: Path) -> str:
        reader = PdfReader(str(file_path))
        parts = []

        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                parts.append(page_text.strip())

        return "\n\n".join(parts).strip()

    def _extract_text_from_docx(self, file_path: Path) -> str:
        doc = Document(str(file_path))
        parts = []

        for paragraph in doc.paragraphs:
            text = (paragraph.text or "").strip()
            if text:
                parts.append(text)

        return "\n".join(parts).strip()

    def _extract_text(
        self,
        file_path: Path,
        mime_type: str,
        original_name: str,
    ) -> tuple[str | None, str]:
        suffix = file_path.suffix.lower()
        mime_type = (mime_type or "").lower()
        original_name = original_name.lower()

        try:
            if mime_type.startswith("text/") or suffix == ".txt" or original_name.endswith(".txt"):
                text = self._extract_text_from_txt(file_path)
                return (text, "parsed") if text else (None, "parsed_empty")

            if mime_type == "application/pdf" or suffix == ".pdf" or original_name.endswith(".pdf"):
                text = self._extract_text_from_pdf(file_path)
                return (text, "parsed") if text else (None, "parsed_empty")

            if (
                mime_type
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                or suffix == ".docx"
                or original_name.endswith(".docx")
            ):
                text = self._extract_text_from_docx(file_path)
                return (text, "parsed") if text else (None, "parsed_empty")

            return None, "uploaded"

        except Exception:
            return None, "parse_failed"

    def _file_to_data_url(self, file_path: Path, mime_type: str) -> str:
        raw = file_path.read_bytes()
        encoded = base64.b64encode(raw).decode("utf-8")
        return f"data:{mime_type};base64,{encoded}"

    def build_chat_image_content_blocks(
        self,
        db: Session,
        *,
        chat_id: int,
        limit: int = 3,
    ) -> list[dict]:
        attachments = (
            db.query(Attachment)
            .filter(Attachment.chat_id == chat_id)
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
            .all()
        )

        selected: list[dict] = []

        for attachment in attachments:
            mime_type = (attachment.mime_type or "").lower()
            if mime_type not in self.supported_vision_mime_types:
                continue

            file_path = Path(attachment.file_path)
            if not file_path.exists():
                continue

            data_url = self._file_to_data_url(file_path, mime_type)

            selected.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": data_url,
                        "detail": "auto",
                    },
                }
            )

            if len(selected) >= limit:
                break

        selected.reverse()
        return selected

    def build_single_image_content_block(self, attachment: Attachment) -> dict | None:
        mime_type = (attachment.mime_type or "").lower()
        if mime_type not in self.supported_vision_mime_types:
            return None

        file_path = Path(attachment.file_path)
        if not file_path.exists():
            return None

        data_url = self._file_to_data_url(file_path, mime_type)

        return {
            "type": "image_url",
            "image_url": {
                "url": data_url,
                "detail": "auto",
            },
        }

    async def save_upload(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int | None,
        message_id: int | None,
        file: UploadFile,
    ) -> Attachment:
        self._ensure_upload_dir()

        safe_original_name = self._build_safe_filename(file.filename or "file.bin")
        mime_type = (file.content_type or "application/octet-stream").lower()

        if mime_type not in self.allowed_mime_types:
            raise AppException("Unsupported file type", status_code=400)

        content = await file.read()

        if not content:
            raise AppException("Uploaded file is empty", status_code=400)

        if len(content) > self.max_file_size_bytes:
            raise AppException(
                f"File too large. Max {self.max_file_size_mb}MB",
                status_code=400,
            )

        extension = Path(safe_original_name).suffix
        unique_name = (
            f"{user_id}_{chat_id or 0}_{message_id or 0}_{os.urandom(8).hex()}{extension}"
        )
        target_path = self.base_upload_dir / unique_name

        with target_path.open("wb") as buffer:
            buffer.write(content)

        size_bytes = len(content)
        sha256 = self._calculate_sha256_from_bytes(content)

        extracted_text, parse_status = self._extract_text(
            target_path,
            mime_type=mime_type,
            original_name=safe_original_name,
        )

        attachment = Attachment(
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            storage_type="local",
            file_path=str(target_path).replace("\\", "/"),
            original_name=safe_original_name,
            mime_type=mime_type,
            size_bytes=size_bytes,
            sha256=sha256,
            extracted_text=extracted_text,
            parse_status=parse_status,
        )

        db.add(attachment)
        db.commit()
        db.refresh(attachment)

        return attachment

    def list_chat_attachments(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int,
    ) -> list[Attachment]:
        return (
            db.query(Attachment)
            .filter(
                Attachment.user_id == user_id,
                Attachment.chat_id == chat_id,
            )
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
            .all()
        )