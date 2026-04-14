from decimal import Decimal, ROUND_HALF_UP

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.ai_model import AIModel
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.models.user import User
from app.repositories.chats import ChatRepository
from app.repositories.messages import MessageRepository
from app.schemas.chat import ChatSendResponse, MessageOut
from app.services.ai_router import AIRouter
from app.services.attachment_service import AttachmentService
from app.services.usage_service import UsageService


class ChatService:
    def __init__(self) -> None:
        self.chat_repo = ChatRepository()
        self.message_repo = MessageRepository()
        self.ai_router = AIRouter()
        self.attachment_service = AttachmentService()
        self.usage_service = UsageService()

    def _get_all_chat_attachments(self, db: Session, chat_id: int) -> list[Attachment]:
        return (
            db.query(Attachment)
            .filter(Attachment.chat_id == chat_id)
            .order_by(Attachment.created_at.asc(), Attachment.id.asc())
            .all()
        )

    def _get_text_attachments(self, db: Session, chat_id: int) -> list[Attachment]:
        return (
            db.query(Attachment)
            .filter(
                Attachment.chat_id == chat_id,
                Attachment.parse_status == "parsed",
                Attachment.extracted_text.isnot(None),
            )
            .order_by(Attachment.created_at.asc(), Attachment.id.asc())
            .all()
        )

    def _clip_text_balanced(self, text: str, max_chars: int) -> str:
        text = (text or "").strip()
        if not text:
            return ""

        if len(text) <= max_chars:
            return text

        marker = "\n\n...[TEXT TRUNCATED]...\n\n"

        if max_chars <= len(marker) + 200:
            return text[:max_chars].strip()

        head_size = int(max_chars * 0.65)
        tail_size = max_chars - head_size - len(marker)
        if tail_size < 0:
            tail_size = 0

        head = text[:head_size].strip()
        tail = text[-tail_size:].strip() if tail_size > 0 else ""

        if tail:
            return f"{head}{marker}{tail}"

        return head

    def _build_attachments_context(self, db: Session, chat_id: int) -> str | None:
        all_attachments = self._get_all_chat_attachments(db, chat_id)
        text_attachments = self._get_text_attachments(db, chat_id)

        if not all_attachments:
            print(f"[ATTACHMENTS] chat_id={chat_id} attachments_found=0")
            return None

        usable_attachments: list[Attachment] = []
        for attachment in text_attachments:
            text = (attachment.extracted_text or "").strip()
            if text:
                usable_attachments.append(attachment)

        total_files = len(all_attachments)
        readable_files = len(usable_attachments)

        unreadable_attachments: list[Attachment] = []
        readable_ids = {attachment.id for attachment in usable_attachments}

        for attachment in all_attachments:
            if attachment.id not in readable_ids:
                unreadable_attachments.append(attachment)

        inventory_lines: list[str] = []
        readable_lines: list[str] = []
        unreadable_lines: list[str] = []

        for index, attachment in enumerate(all_attachments, start=1):
            inventory_lines.append(
                f"{index}. {attachment.original_name} "
                f"(mime={attachment.mime_type}, status={attachment.parse_status})"
            )

        max_total_chars = 24000
        per_file_budget = max(1400, min(2600, max_total_chars // max(readable_files, 1)))

        attachment_blocks: list[str] = []
        included_filenames: list[str] = []

        for index, attachment in enumerate(usable_attachments, start=1):
            original_name = attachment.original_name or f"attachment_{attachment.id}"
            mime_type = attachment.mime_type or "unknown"
            full_text = (attachment.extracted_text or "").strip()

            clipped_text = self._clip_text_balanced(full_text, per_file_budget)

            readable_lines.append(f"{index}. {original_name}")
            included_filenames.append(original_name)

            attachment_blocks.append(
                f"[ATTACHMENT {index}]\n"
                f"filename: {original_name}\n"
                f"mime_type: {mime_type}\n"
                f"parse_status: {attachment.parse_status}\n"
                f"text_excerpt:\n{clipped_text}"
            )

        for attachment in unreadable_attachments:
            unreadable_lines.append(
                f"- {attachment.original_name} "
                f"(mime={attachment.mime_type}, status={attachment.parse_status})"
            )

        print(
            f"[ATTACHMENTS] chat_id={chat_id} "
            f"attachments_found={len(all_attachments)} "
            f"text_attachments_used={len(usable_attachments)} "
            f"unreadable_attachments={len(unreadable_attachments)} "
            f"per_file_budget={per_file_budget} "
            f"filenames={included_filenames}"
        )

        parts: list[str] = []

        parts.append(
            "Список ВСЕХ вложений в этом чате:\n" + "\n".join(inventory_lines)
        )

        if readable_lines:
            parts.append(
                "Файлы, по которым удалось извлечь текст:\n" + "\n".join(readable_lines)
            )

        if unreadable_lines:
            parts.append(
                "Файлы, по которым текст извлечь не удалось или он пустой:\n"
                + "\n".join(unreadable_lines)
            )

        if attachment_blocks:
            parts.append(
                "Материалы по читаемым файлам ниже. "
                "Каждый блок относится к отдельному файлу.\n\n"
                + "\n\n==============================\n\n".join(attachment_blocks)
            )

        parts.append(
            "ИНСТРУКЦИЯ ПО ОТВЕТУ:\n"
            "1. Сначала перечисли ВСЕ вложения из списка.\n"
            "2. Затем отдельно напиши по каждому читаемому файлу по 2–4 коротких пункта.\n"
            "3. Для файлов, у которых текст не извлечён, прямо напиши: "
            "'текст не извлечён, требуется отдельный анализ/другой способ парсинга'.\n"
            "4. Не ограничивайся первым файлом.\n"
            "5. Ответ делай компактным, чтобы он не обрывался."
        )

        return "\n\n".join(part for part in parts if part).strip()

    def _build_provider_messages(
        self,
        db: Session,
        *,
        chat_id: int,
        supports_vision: bool,
    ) -> list[dict]:
        history = self.message_repo.list_by_chat(db, chat_id)

        provider_messages: list[dict] = []
        last_user_index: int | None = None

        for msg in history:
            if msg.role not in ("user", "assistant", "system"):
                continue

            provider_messages.append(
                {
                    "role": msg.role,
                    "content": msg.content,
                }
            )

            if msg.role == "user":
                last_user_index = len(provider_messages) - 1

        if supports_vision and last_user_index is not None:
            image_blocks = self.attachment_service.build_chat_image_content_blocks(
                db,
                chat_id=chat_id,
                limit=6,
            )

            if image_blocks:
                print(
                    f"[VISION] chat_id={chat_id} "
                    f"vision_attachments_used={len(image_blocks)}"
                )

                last_user_content = provider_messages[last_user_index]["content"]
                provider_messages[last_user_index]["content"] = [
                    {
                        "type": "text",
                        "text": last_user_content,
                    },
                    *image_blocks,
                ]
            else:
                print(f"[VISION] chat_id={chat_id} vision_attachments_used=0")

        return provider_messages

    def _prepare_turn_context(
        self,
        db: Session,
        *,
        chat: Chat,
    ) -> tuple[AIModel, str | None, list[dict]]:
        primary_model = (
            db.query(AIModel)
            .filter(AIModel.slug == chat.model_slug, AIModel.is_active == True)
            .first()
        )
        if not primary_model:
            raise AppException(
                f"Model '{chat.model_slug}' not found or inactive",
                status_code=404,
            )

        attachments_context = self._build_attachments_context(db, chat.id)

        final_system_prompt_parts = []

        if chat.system_prompt:
            final_system_prompt_parts.append(chat.system_prompt.strip())

        final_system_prompt_parts.append(
            "Если в контексте есть attachments/files, используй их как основной источник фактов.\n"
            "Если файлов несколько, твой ответ ОБЯЗАН содержать отдельный пункт по каждому файлу.\n"
            "Старайся отвечать компактно и структурно, чтобы не обрывать ответ.\n"
            "Структура ответа:\n"
            "1) Все найденные файлы\n"
            "2) Кратко по каждому файлу\n"
            "3) Что не удалось прочитать\n"
            "4) Общий вывод"
        )

        if attachments_context:
            final_system_prompt_parts.append(attachments_context)

        final_system_prompt = "\n\n".join(
            part for part in final_system_prompt_parts if part
        ) or None

        provider_messages = self._build_provider_messages(
            db,
            chat_id=chat.id,
            supports_vision=bool(primary_model.supports_vision),
        )

        return primary_model, final_system_prompt, provider_messages

    def _resolve_max_output_tokens(self, model: AIModel) -> int:
        configured = int(model.max_output_tokens or 0)
        return max(configured, 1400)

    def _should_autoname_chat(self, chat: Chat) -> bool:
        title = (chat.title or "").strip().lower()
        return title in {"", "новый чат", "new chat", "chat"}

    def _build_auto_chat_title(self, message_text: str) -> str | None:
        text = " ".join((message_text or "").split()).strip()
        if not text:
            return None

        max_words = 8
        max_chars = 60

        words = text.split()
        title = " ".join(words[:max_words]).strip()

        if len(title) > max_chars:
            cropped = title[:max_chars].strip()
            if " " in cropped:
                cropped = cropped.rsplit(" ", 1)[0].strip()
            title = cropped or title[:max_chars].strip()

        title = title.strip(" .,:;!?-—\"'`")
        return title or None

    def _apply_auto_chat_title(
        self,
        db: Session,
        *,
        chat: Chat,
        message_text: str,
    ) -> None:
        if not self._should_autoname_chat(chat):
            return

        title = self._build_auto_chat_title(message_text)
        if not title:
            return

        chat.title = title
        db.add(chat)
        db.commit()
        db.refresh(chat)

    async def _generate_and_store_answer(
        self,
        db: Session,
        *,
        user: User,
        chat: Chat,
        primary_model: AIModel,
        final_system_prompt: str | None,
        provider_messages: list[dict],
        user_message,
    ) -> ChatSendResponse:
        client = self.ai_router.get_client(db, primary_model.slug)

        try:
            ai_response = await client.generate(
                model_slug=primary_model.api_model_name,
                messages=provider_messages,
                system_prompt=final_system_prompt,
                stream=False,
                max_output_tokens=self._resolve_max_output_tokens(primary_model),
                temperature=float(primary_model.temperature),
            )
            used_model = primary_model

        except Exception as e:
            print(f"PRIMARY MODEL FAILED: {e}")

            if not primary_model.fallback_model_slug:
                raise AppException(
                    f"Primary model '{primary_model.slug}' failed and no fallback configured",
                    status_code=502,
                )

            fallback_model = (
                db.query(AIModel)
                .filter(
                    AIModel.slug == primary_model.fallback_model_slug,
                    AIModel.is_active == True,
                )
                .first()
            )

            if not fallback_model:
                raise AppException(
                    f"Fallback model '{primary_model.fallback_model_slug}' not found or inactive",
                    status_code=502,
                )

            fallback_client = self.ai_router.get_client(db, fallback_model.slug)

            print(f"TRYING FALLBACK FROM DB: {fallback_model.slug}")

            fallback_provider_messages = self._build_provider_messages(
                db,
                chat_id=chat.id,
                supports_vision=bool(fallback_model.supports_vision),
            )

            ai_response = await fallback_client.generate(
                model_slug=fallback_model.api_model_name,
                messages=fallback_provider_messages,
                system_prompt=final_system_prompt,
                stream=False,
                max_output_tokens=self._resolve_max_output_tokens(fallback_model),
                temperature=float(fallback_model.temperature),
            )
            used_model = fallback_model

        input_price = Decimal(str(used_model.input_price_per_1m or 0))
        output_price = Decimal(str(used_model.output_price_per_1m or 0))

        prompt_tokens = Decimal(ai_response.prompt_tokens)
        completion_tokens = Decimal(ai_response.completion_tokens)

        input_cost = (prompt_tokens / Decimal("1000000")) * input_price
        output_cost = (completion_tokens / Decimal("1000000")) * output_price
        total_cost = input_cost + output_cost

        input_cost = input_cost.quantize(
            Decimal("0.000001"),
            rounding=ROUND_HALF_UP,
        )
        output_cost = output_cost.quantize(
            Decimal("0.000001"),
            rounding=ROUND_HALF_UP,
        )
        total_cost = total_cost.quantize(
            Decimal("0.000001"),
            rounding=ROUND_HALF_UP,
        )

        assistant_message = self.message_repo.create(
            db,
            chat_id=chat.id,
            user_id=None,
            role="assistant",
            content=ai_response.content,
            provider_slug=ai_response.provider_slug,
            model_slug=used_model.slug,
            prompt_tokens=ai_response.prompt_tokens,
            completion_tokens=ai_response.completion_tokens,
            total_tokens=ai_response.total_tokens,
            input_cost=input_cost,
            output_cost=output_cost,
            total_cost=total_cost,
        )

        self.usage_service.record(
            db,
            user_id=user.id,
            chat_id=chat.id,
            message_id=assistant_message.id,
            provider_slug=ai_response.provider_slug,
            model_slug=used_model.slug,
            request_type="chat",
            prompt_tokens=ai_response.prompt_tokens,
            completion_tokens=ai_response.completion_tokens,
            total_tokens=ai_response.total_tokens,
            input_cost=input_cost,
            output_cost=output_cost,
            total_cost=total_cost,
            raw_response=ai_response.raw_response,
        )

        if user.billing_enabled:
            user.total_spent_usd = Decimal(str(user.total_spent_usd or 0)) + total_cost
            db.commit()
            db.refresh(user)

        return ChatSendResponse(
            user_message=MessageOut.model_validate(user_message),
            assistant_message=MessageOut.model_validate(assistant_message),
        )

    def _validate_chat_and_user(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int,
    ) -> tuple[Chat, User]:
        chat = self.chat_repo.get_by_id(db, chat_id)
        if not chat:
            raise AppException("Chat not found", status_code=404)

        if chat.user_id != user_id:
            raise AppException("Access denied", status_code=403)

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise AppException("User not found", status_code=404)

        if user.billing_enabled:
            total_spent = Decimal(str(user.total_spent_usd or 0))
            spending_limit = Decimal(str(user.spending_limit_usd or 0))
            if total_spent >= spending_limit:
                raise AppException("Spending limit reached", status_code=402)

        return chat, user

    async def send_message(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int,
        message_text: str,
    ) -> ChatSendResponse:
        chat, user = self._validate_chat_and_user(
            db,
            user_id=user_id,
            chat_id=chat_id,
        )

        user_message = self.message_repo.create(
            db,
            chat_id=chat.id,
            user_id=user_id,
            role="user",
            content=message_text,
            model_slug=chat.model_slug,
        )

        self._apply_auto_chat_title(
            db,
            chat=chat,
            message_text=message_text,
        )

        primary_model, final_system_prompt, provider_messages = self._prepare_turn_context(
            db,
            chat=chat,
        )

        return await self._generate_and_store_answer(
            db,
            user=user,
            chat=chat,
            primary_model=primary_model,
            final_system_prompt=final_system_prompt,
            provider_messages=provider_messages,
            user_message=user_message,
        )

    async def send_message_with_attachments(
        self,
        db: Session,
        *,
        user_id: int,
        chat_id: int,
        message_text: str,
        files: list[UploadFile],
    ) -> tuple[ChatSendResponse, list[Attachment]]:
        chat, user = self._validate_chat_and_user(
            db,
            user_id=user_id,
            chat_id=chat_id,
        )

        user_message = self.message_repo.create(
            db,
            chat_id=chat.id,
            user_id=user_id,
            role="user",
            content=message_text,
            model_slug=chat.model_slug,
        )

        self._apply_auto_chat_title(
            db,
            chat=chat,
            message_text=message_text,
        )

        saved_attachments: list[Attachment] = []

        for file in files:
            if not file or not file.filename:
                continue

            attachment = await self.attachment_service.save_upload(
                db,
                user_id=user_id,
                chat_id=chat.id,
                message_id=user_message.id,
                file=file,
            )
            saved_attachments.append(attachment)

        primary_model, final_system_prompt, provider_messages = self._prepare_turn_context(
            db,
            chat=chat,
        )

        response = await self._generate_and_store_answer(
            db,
            user=user,
            chat=chat,
            primary_model=primary_model,
            final_system_prompt=final_system_prompt,
            provider_messages=provider_messages,
            user_message=user_message,
        )

        return response, saved_attachments