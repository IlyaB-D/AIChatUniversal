"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AttachmentItem,
  ChatItem,
  MessageItem,
  ModelItem,
  UserMe,
  createChat,
  deleteAttachment,
  deleteChat,
  generateImage,
  getAttachments,
  getChats,
  getHistory,
  getMe,
  getModels,
  initAuthToken,
  login,
  register,
  sendMessage,
  sendMessageWithAttachment,
  setAuthToken,
  updateChat,
} from "@/lib/api";

type AuthMode = "login" | "register";
type WorkMode = "chat" | "image";

const FALLBACK_MODEL_SLUG = "claude-sonnet-4-6";

function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    response?: {
      data?: {
        detail?: unknown;
        message?: unknown;
      };
      status?: number;
    };
    message?: string;
  };

  const detail = err?.response?.data?.detail;
  const message = err?.response?.data?.message;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const joined = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");

    if (joined) {
      return joined;
    }
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }

  return fallback;
}

function getModelLabel(model: ModelItem): string {
  const provider = model.provider_slug || model.provider || "";
  return provider ? `${model.name} (${provider})` : model.name;
}

function getBackendOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api"
  ).replace(/\/api\/?$/, "");
}

function normalizeImageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${getBackendOrigin()}${rawUrl}`;
}

function extractAssistantMessage(
  raw: MessageItem | Record<string, unknown> | string,
  chatId: number,
  modelSlug: string
): MessageItem | null {
  if (!raw) {
    return null;
  }

  if (typeof raw === "string") {
    return {
      id: Date.now(),
      chat_id: chatId,
      role: "assistant",
      content: raw,
      model_slug: modelSlug,
      created_at: new Date().toISOString(),
    };
  }

  const data = raw as Record<string, unknown>;

  const candidates = [
    data.assistant_message,
    data.message,
    data.item,
    data.data,
    data.response,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      "chat_id" in candidate &&
      "role" in candidate &&
      "content" in candidate
    ) {
      const msg = candidate as MessageItem;
      return {
        ...msg,
        model_slug: msg.model_slug || modelSlug,
        image_url: normalizeImageUrl(msg.image_url),
      };
    }
  }

  if ("chat_id" in data && "role" in data && "content" in data) {
    const msg = data as unknown as MessageItem;
    return {
      ...msg,
      model_slug: msg.model_slug || modelSlug,
      image_url: normalizeImageUrl(msg.image_url),
    };
  }

  if (typeof data.content === "string" || typeof data.image_url === "string") {
    return {
      id: Date.now(),
      chat_id: chatId,
      role: "assistant",
      content:
        typeof data.content === "string"
          ? data.content
          : "Изображение сгенерировано.",
      model_slug: modelSlug,
      image_url: normalizeImageUrl(
        typeof data.image_url === "string" ? data.image_url : null
      ),
      created_at: new Date().toISOString(),
    };
  }

  if (typeof data.text === "string") {
    return {
      id: Date.now(),
      chat_id: chatId,
      role: "assistant",
      content: data.text,
      model_slug: modelSlug,
      created_at: new Date().toISOString(),
    };
  }

  if (typeof data.assistant_reply === "string") {
    return {
      id: Date.now(),
      chat_id: chatId,
      role: "assistant",
      content: data.assistant_reply,
      model_slug: modelSlug,
      created_at: new Date().toISOString(),
    };
  }

  return null;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function buildChatPlainText(
  chat: ChatItem | null,
  messages: MessageItem[],
  attachments: AttachmentItem[]
): string {
  const header = [
    `Чат: ${chat?.title || "Без названия"}`,
    `Модель: ${chat?.model_slug || "-"}`,
    `Создан: ${formatDate(chat?.created_at) || "-"}`,
    `Обновлён: ${formatDate(chat?.updated_at) || "-"}`,
    "",
    "Вложения:",
    ...(attachments.length > 0
      ? attachments.map(
          (item, index) =>
            `${index + 1}. ${item.original_name} | ${item.mime_type || "unknown"} | ${item.size_bytes ?? 0} bytes | статус: ${item.parse_status || "unknown"}`
        )
      : ["Нет вложений"]),
    "",
    "Сообщения:",
    ...messages.flatMap((message, index) => [
      `${index + 1}. ${message.role.toUpperCase()} | ${formatDate(message.created_at) || "-"}`,
      message.content,
      message.image_url ? `IMAGE: ${normalizeImageUrl(message.image_url)}` : "",
      "",
    ]),
  ];

  return header.join("\n");
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyTextWithFallback(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard API is unavailable in this environment.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const success = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error("Не удалось скопировать текст через fallback.");
  }
}

export default function Chat() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<UserMe | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelSlug, setSelectedModelSlug] = useState(FALLBACK_MODEL_SLUG);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [message, setMessage] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("chat");

  const [authError, setAuthError] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [updatingChatModel, setUpdatingChatModel] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [copyingChat, setCopyingChat] = useState(false);
  const [sharingChat, setSharingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedChat = useMemo(
    () => chats.find((item) => item.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadInitialData();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedChatId || !isAuthenticated) {
      setMessages([]);
      setAttachments([]);
      return;
    }

    void loadChatData(selectedChatId);
  }, [selectedChatId, isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedChat) return;
    if (selectedChat.model_slug) {
      setSelectedModelSlug(selectedChat.model_slug);
    }
  }, [selectedChat]);

  async function initializeAuth() {
    const token = initAuthToken();

    if (!token) {
      setAuthChecking(false);
      setIsAuthenticated(false);
      setAuthUser(null);
      return;
    }

    try {
      const me = await getMe();
      setAuthUser(me);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Ошибка проверки токена:", error);
      setAuthToken(null);
      setAuthUser(null);
      setIsAuthenticated(false);
    } finally {
      setAuthChecking(false);
    }
  }

  async function loadInitialData() {
    await Promise.all([loadModels(), loadChats()]);
  }

  async function loadModels() {
    try {
      setLoadingModels(true);
      const items = await getModels();
      setModels(items);

      const explicitFallback = items.find((item) => item.slug === FALLBACK_MODEL_SLUG);
      const defaultModel = items.find((item) => item.is_default);
      const firstActive = items.find((item) => item.is_active !== false);
      const firstItem = items[0];

      const nextSlug =
        explicitFallback?.slug ||
        defaultModel?.slug ||
        firstActive?.slug ||
        firstItem?.slug ||
        FALLBACK_MODEL_SLUG;

      setSelectedModelSlug(nextSlug);
    } catch (error) {
      console.error("Ошибка загрузки моделей:", error);
      setErrorText(getErrorMessage(error, "Не удалось загрузить модели."));
    } finally {
      setLoadingModels(false);
    }
  }

  async function loadChats() {
    try {
      setLoadingChats(true);
      setErrorText(null);

      const items = await getChats();
      setChats(items);

      setSelectedChatId((prev) => {
        if (prev && items.some((chat) => chat.id === prev)) {
          return prev;
        }
        return items.length > 0 ? items[0].id : null;
      });
    } catch (error) {
      console.error("Ошибка загрузки чатов:", error);

      const err = error as { response?: { status?: number } };
      if (err?.response?.status === 401) {
        handleLogout();
        return;
      }

      setErrorText(getErrorMessage(error, "Не удалось загрузить список чатов."));
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadChatData(chatId: number) {
    await Promise.all([loadMessages(chatId), loadAttachmentsForChat(chatId)]);
  }

  async function loadMessages(chatId: number) {
    try {
      setLoadingMessages(true);
      setErrorText(null);

      const items = await getHistory(chatId);
      setMessages(
        items.map((item) => ({
          ...item,
          image_url: normalizeImageUrl(item.image_url),
        }))
      );
    } catch (error) {
      console.error("Ошибка загрузки сообщений:", error);
      setErrorText(getErrorMessage(error, "Не удалось загрузить историю чата."));
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadAttachmentsForChat(chatId: number) {
    try {
      setLoadingAttachments(true);
      const items = await getAttachments(chatId);
      setAttachments(items);
    } catch (error) {
      console.error("Ошибка загрузки вложений:", error);
      setAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  }

  function clearSessionState() {
    setChats([]);
    setSelectedChatId(null);
    setMessages([]);
    setAttachments([]);
    setSelectedFile(null);
    setMessage("");
    setImagePrompt("");
    setErrorText(null);
    setSuccessText(null);
    setWorkMode("chat");
  }

  function handleLogout() {
    setAuthToken(null);
    setAuthUser(null);
    setIsAuthenticated(false);
    setAuthChecking(false);
    setEmail("");
    setPassword("");
    setAuthError(null);
    clearSessionState();
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setAuthError("Введите email и пароль.");
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError(null);
      setErrorText(null);
      setSuccessText(null);

      const response =
        authMode === "login"
          ? await login({ email: normalizedEmail, password: normalizedPassword })
          : await register({ email: normalizedEmail, password: normalizedPassword });

      setAuthToken(response.access_token);

      const me = response.user ?? (await getMe());

      setAuthUser(me);
      setIsAuthenticated(true);
      setPassword("");
      clearSessionState();
    } catch (error) {
      console.error("Ошибка авторизации:", error);
      setAuthError(
        getErrorMessage(
          error,
          authMode === "login"
            ? "Не удалось выполнить вход."
            : "Не удалось зарегистрироваться."
        )
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function createNewChat(): Promise<ChatItem | null> {
    const modelSlug =
      selectedModelSlug ||
      models.find((item) => item.slug === FALLBACK_MODEL_SLUG)?.slug ||
      models[0]?.slug ||
      FALLBACK_MODEL_SLUG;

    try {
      setCreatingChat(true);
      setErrorText(null);
      setSuccessText(null);

      const created = await createChat({
        title: workMode === "image" ? "Новый image чат" : "Новый чат",
        model_slug: modelSlug,
        system_prompt: "Отвечай кратко и по делу.",
      });

      setChats((prev) => [created, ...prev]);
      setSelectedChatId(created.id);
      setSelectedModelSlug(created.model_slug || modelSlug);
      setMessages([]);
      setAttachments([]);
      setSelectedFile(null);
      setMessage("");
      setImagePrompt("");

      return created;
    } catch (error) {
      console.error("Ошибка создания чата:", error);
      setErrorText(getErrorMessage(error, "Не удалось создать чат."));
      return null;
    } finally {
      setCreatingChat(false);
    }
  }

  async function ensureChat(): Promise<ChatItem | null> {
    if (selectedChat) {
      return selectedChat;
    }

    return createNewChat();
  }

  async function handleCreateChat() {
    const chat = await createNewChat();
    if (chat) {
      setSuccessText(`Чат #${chat.id} создан.`);
    }
  }

  async function handleDeleteSelectedChat() {
    if (!selectedChat) {
      setErrorText("Нет выбранного чата для удаления.");
      return;
    }

    const confirmed = window.confirm(
      `Удалить чат "${selectedChat.title || `#${selectedChat.id}`}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingChat(true);
      setErrorText(null);
      setSuccessText(null);

      await deleteChat(selectedChat.id);

      const nextChats = chats.filter((chat) => chat.id !== selectedChat.id);
      setChats(nextChats);

      if (nextChats.length > 0) {
        setSelectedChatId(nextChats[0].id);
      } else {
        setSelectedChatId(null);
        setMessages([]);
        setAttachments([]);
      }

      setSelectedFile(null);
      setMessage("");
      setImagePrompt("");
      setSuccessText("Чат удалён.");
    } catch (error) {
      console.error("Ошибка удаления чата:", error);
      setErrorText(
        getErrorMessage(
          error,
          "Не удалось удалить чат. Проверь, существует ли DELETE /api/chats/{id} в backend."
        )
      );
    } finally {
      setDeletingChat(false);
    }
  }

  async function handleChangeChatModel(nextModelSlug: string) {
    if (!selectedChat) {
      setSelectedModelSlug(nextModelSlug);
      return;
    }

    try {
      setUpdatingChatModel(true);
      setErrorText(null);
      setSuccessText(null);

      const updated = await updateChat(selectedChat.id, {
        model_slug: nextModelSlug,
      });

      setChats((prev) =>
        prev.map((chat) => (chat.id === updated.id ? updated : chat))
      );
      setSelectedModelSlug(updated.model_slug || nextModelSlug);
      setSuccessText(`Модель чата изменена на ${updated.model_slug}.`);
    } catch (error) {
      console.error("Ошибка смены модели чата:", error);
      setErrorText(
        getErrorMessage(
          error,
          "Не удалось изменить модель чата. Проверь, существует ли PATCH /api/chats/{id} в backend."
        )
      );
    } finally {
      setUpdatingChatModel(false);
    }
  }

  async function handleDeleteAttachment(attachment: AttachmentItem) {
    const confirmed = window.confirm(
      `Удалить файл "${attachment.original_name || `#${attachment.id}`}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingAttachmentId(attachment.id);
      setErrorText(null);
      setSuccessText(null);

      await deleteAttachment(attachment.id);

      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
      setSuccessText(`Файл "${attachment.original_name}" удалён.`);
    } catch (error) {
      console.error("Ошибка удаления файла:", error);
      setErrorText(
        getErrorMessage(
          error,
          "Не удалось удалить файл. Проверь, существует ли DELETE /api/attachments/{id} в backend."
        )
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function handleCopyChatContent() {
    if (!selectedChat) {
      setErrorText("Нет выбранного чата для копирования.");
      return;
    }

    try {
      setCopyingChat(true);
      setErrorText(null);
      setSuccessText(null);

      const content = buildChatPlainText(selectedChat, messages, attachments);
      await copyTextWithFallback(content);

      setSuccessText("Содержимое чата скопировано в буфер обмена.");
    } catch (error) {
      console.error("Ошибка копирования чата:", error);
      setErrorText(
        getErrorMessage(error, "Не удалось скопировать содержимое чата.")
      );
    } finally {
      setCopyingChat(false);
    }
  }

  function handleExportChatTxt() {
    if (!selectedChat) {
      setErrorText("Нет выбранного чата для экспорта.");
      return;
    }

    const content = buildChatPlainText(selectedChat, messages, attachments);
    const safeTitle = (selectedChat.title || `chat-${selectedChat.id}`)
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "_")
      .trim()
      .replace(/\s+/g, "_");

    downloadTextFile(
      `${safeTitle || `chat-${selectedChat.id}`}.txt`,
      content,
      "text/plain;charset=utf-8"
    );
    setSuccessText("TXT-экспорт чата сохранён.");
  }

  function handleExportChatJson() {
    if (!selectedChat) {
      setErrorText("Нет выбранного чата для экспорта.");
      return;
    }

    const payload = {
      chat: selectedChat,
      attachments,
      messages,
      exported_at: new Date().toISOString(),
    };

    const safeTitle = (selectedChat.title || `chat-${selectedChat.id}`)
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "_")
      .trim()
      .replace(/\s+/g, "_");

    downloadTextFile(
      `${safeTitle || `chat-${selectedChat.id}`}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    setSuccessText("JSON-экспорт чата сохранён.");
  }

  async function handleShareChat() {
    if (!selectedChat) {
      setErrorText("Нет выбранного чата для отправки.");
      return;
    }

    const content = buildChatPlainText(selectedChat, messages, attachments);
    const title = selectedChat.title || `Чат #${selectedChat.id}`;

    try {
      setSharingChat(true);
      setErrorText(null);
      setSuccessText(null);

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          text: content,
        });
        setSuccessText("Чат отправлен через системное меню шаринга.");
        return;
      }

      try {
        await copyTextWithFallback(content);
        setSuccessText(
          "Системный шаринг недоступен. Содержимое чата скопировано в буфер."
        );
        return;
      } catch {
        const safeTitle = title
          .replace(/[^\p{L}\p{N}\-_ ]/gu, "_")
          .trim()
          .replace(/\s+/g, "_");

        downloadTextFile(
          `${safeTitle || `chat-${selectedChat.id}`}.txt`,
          content,
          "text/plain;charset=utf-8"
        );
        setSuccessText(
          "Системный шаринг и буфер недоступны. Чат экспортирован в TXT."
        );
      }
    } catch (error) {
      console.error("Ошибка share/export чата:", error);
      setErrorText(getErrorMessage(error, "Не удалось поделиться чатом."));
    } finally {
      setSharingChat(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = message.trim();
    const hasFile = !!selectedFile;

    if (!text && !hasFile) {
      setErrorText("Введите сообщение или выберите файл.");
      return;
    }

    const chat = await ensureChat();
    if (!chat) {
      return;
    }

    const modelSlug =
      chat.model_slug ||
      selectedModelSlug ||
      models.find((item) => item.slug === FALLBACK_MODEL_SLUG)?.slug ||
      models[0]?.slug ||
      FALLBACK_MODEL_SLUG;

    const outgoingText = text || "Проанализируй приложенный файл.";

    const optimisticUserMessage: MessageItem = {
      id: Date.now(),
      chat_id: chat.id,
      role: "user",
      content: hasFile ? `${outgoingText}\n\n[Файл: ${selectedFile?.name}]` : outgoingText,
      model_slug: modelSlug,
      created_at: new Date().toISOString(),
    };

    try {
      setSending(true);
      setErrorText(null);
      setSuccessText(null);

      setMessages((prev) => [...prev, optimisticUserMessage]);
      setMessage("");

      const response =
        hasFile && selectedFile
          ? await sendMessageWithAttachment({
              chat_id: chat.id,
              message: outgoingText,
              model_slug: modelSlug,
              file: selectedFile,
            })
          : await sendMessage({
              chat_id: chat.id,
              message: outgoingText,
              model_slug: modelSlug,
            });

      const assistantMessage = extractAssistantMessage(response, chat.id, modelSlug);

      if (assistantMessage) {
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        await loadMessages(chat.id);
      }

      await loadAttachmentsForChat(chat.id);
      await loadChats();

      clearSelectedFile();
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);

      setMessages((prev) =>
        prev.filter((item) => item.id !== optimisticUserMessage.id)
      );

      setErrorText(getErrorMessage(error, "Не удалось отправить сообщение."));
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = imagePrompt.trim();
    if (!prompt) {
      setErrorText("Введите промпт для генерации изображения.");
      return;
    }

    if (selectedFile) {
      setErrorText(
        "Backend сейчас поддерживает только text → image через /api/images/generate. Сценарий text + image → image пока недоступен."
      );
      return;
    }

    const chat = await ensureChat();
    if (!chat) {
      return;
    }

    const optimisticUserMessage: MessageItem = {
      id: Date.now(),
      chat_id: chat.id,
      role: "user",
      content: `[IMAGE PROMPT]\n${prompt}`,
      model_slug: chat.model_slug || selectedModelSlug,
      created_at: new Date().toISOString(),
    };

    try {
      setGeneratingImage(true);
      setErrorText(null);
      setSuccessText(null);

      setMessages((prev) => [...prev, optimisticUserMessage]);

      const response = await generateImage({
        prompt,
        chat_id: chat.id,
      });

      const assistantMessage = extractAssistantMessage(
        response as MessageItem | Record<string, unknown> | string,
        chat.id,
        chat.model_slug || selectedModelSlug
      );

      if (assistantMessage) {
        const normalizedAssistant: MessageItem = {
          ...assistantMessage,
          content:
            assistantMessage.content?.trim() || "Изображение сгенерировано.",
          image_url: normalizeImageUrl(assistantMessage.image_url),
        };

        setMessages((prev) => [...prev, normalizedAssistant]);
      } else {
        await loadMessages(chat.id);
      }

      await loadChats();
      setImagePrompt("");
    } catch (error) {
      console.error("Ошибка генерации изображения:", error);

      setMessages((prev) =>
        prev.filter((item) => item.id !== optimisticUserMessage.id)
      );

      setErrorText(getErrorMessage(error, "Не удалось сгенерировать изображение."));
    } finally {
      setGeneratingImage(false);
    }
  }

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Проверка авторизации...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="mb-2 text-2xl font-bold">AIChatUniversal</h1>
          <p className="mb-6 text-sm text-slate-400">
            Войдите или зарегистрируйтесь, чтобы продолжить.
          </p>

          <div className="mb-6 flex rounded-xl bg-slate-800 p-1">
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
                authMode === "login"
                  ? "bg-white text-slate-900"
                  : "text-slate-300"
              }`}
              onClick={() => setAuthMode("login")}
            >
              Вход
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
                authMode === "register"
                  ? "bg-white text-slate-900"
                  : "text-slate-300"
              }`}
              onClick={() => setAuthMode("register")}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
            />

            {authError && (
              <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {authLoading
                ? authMode === "login"
                  ? "Вход..."
                  : "Регистрация..."
                : authMode === "login"
                  ? "Войти"
                  : "Зарегистрироваться"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const messageBoxHeightClass = workMode === "image" ? "min-h-[420px]" : "min-h-[520px]";

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <aside className="flex w-80 flex-col border-r border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Аккаунт</div>
              <div className="max-w-[180px] truncate text-sm font-semibold">
                {authUser?.email}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Выйти
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCreateChat()}
            disabled={creatingChat}
            className="mb-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingChat ? "Создание..." : "+ Новый чат"}
          </button>

          <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
            МОДЕЛЬ ПО УМОЛЧАНИЮ
          </label>
          <select
            value={selectedModelSlug}
            onChange={(e) => setSelectedModelSlug(e.target.value)}
            disabled={loadingModels || updatingChatModel}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
          >
            {models.length === 0 ? (
              <option value={FALLBACK_MODEL_SLUG}>{FALLBACK_MODEL_SLUG}</option>
            ) : (
              models.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {getModelLabel(model)}
                </option>
              ))
            )}
          </select>

          <div className="mt-4">
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
              РЕЖИМ
            </label>
            <div className="flex rounded-xl bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setWorkMode("chat")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
                  workMode === "chat" ? "bg-white text-slate-900" : "text-slate-300"
                }`}
              >
                Чат
              </button>
              <button
                type="button"
                onClick={() => setWorkMode("image")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
                  workMode === "image" ? "bg-white text-slate-900" : "text-slate-300"
                }`}
              >
                Изображение
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loadingChats ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
              Загрузка чатов...
            </div>
          ) : chats.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
              Чатов пока нет
            </div>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => {
                const isActive = chat.id === selectedChatId;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`block w-full rounded-xl border p-3 text-left ${
                      isActive
                        ? "border-slate-500 bg-slate-800"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <div className="truncate text-sm font-semibold">
                      {chat.title || `Чат #${chat.id}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {chat.model_slug}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {formatDate(chat.updated_at || chat.created_at)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div>
              <div className="text-lg font-semibold">
                {selectedChat ? selectedChat.title || `Чат #${selectedChat.id}` : "Новый чат"}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Активная модель: {selectedChat?.model_slug || selectedModelSlug}
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:justify-end">
              <div className="min-w-[260px]">
                <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
                  МОДЕЛЬ ВНУТРИ ЧАТА
                </label>
                <select
                  value={selectedChat?.model_slug || selectedModelSlug}
                  onChange={(e) => void handleChangeChatModel(e.target.value)}
                  disabled={!selectedChat || updatingChatModel || loadingModels}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                >
                  {models.length === 0 ? (
                    <option value={FALLBACK_MODEL_SLUG}>{FALLBACK_MODEL_SLUG}</option>
                  ) : (
                    models.map((model) => (
                      <option key={model.slug} value={model.slug}>
                        {getModelLabel(model)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={() => void handleCopyChatContent()}
                disabled={!selectedChat || copyingChat}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copyingChat ? "Копирование..." : "Копировать чат"}
              </button>

              <button
                type="button"
                onClick={handleExportChatTxt}
                disabled={!selectedChat}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Экспорт TXT
              </button>

              <button
                type="button"
                onClick={handleExportChatJson}
                disabled={!selectedChat}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Экспорт JSON
              </button>

              <button
                type="button"
                onClick={() => void handleShareChat()}
                disabled={!selectedChat || sharingChat}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sharingChat ? "Поделиться..." : "Поделиться"}
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteSelectedChat()}
                disabled={!selectedChat || deletingChat}
                className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingChat ? "Удаление..." : "Удалить чат"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorText ? (
            <div className="mb-4 rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          ) : null}

          {successText ? (
            <div className="mb-4 rounded-xl border border-emerald-900 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
              {successText}
            </div>
          ) : null}

          {workMode === "image" ? (
            <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-300">
                Image Mode
              </div>
              <div className="text-sm text-slate-400">
                Сейчас backend поддерживает только генерацию изображения по текстовому промпту через <code>/api/images/generate</code>.
                Сценарий <code>text + image → image</code> пока не реализован на backend.
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <section className={`rounded-2xl border border-slate-800 bg-slate-950 p-4 ${messageBoxHeightClass}`}>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-300">Сообщения</div>
                {loadingMessages ? (
                  <div className="text-xs text-slate-500">Загрузка...</div>
                ) : null}
              </div>

              <div className="flex max-h-[580px] flex-col gap-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
                    История пуста. Создай чат или отправь первое сообщение.
                  </div>
                ) : (
                  messages.map((item) => {
                    const imageUrl = normalizeImageUrl(item.image_url);
                    return (
                      <div
                        key={`${item.id}-${item.created_at ?? ""}`}
                        className={`max-w-[85%] rounded-2xl border p-4 ${
                          item.role === "user"
                            ? "self-end border-sky-900 bg-sky-950"
                            : "self-start border-slate-800 bg-slate-900"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-slate-400">
                          <span>{item.role === "user" ? "USER" : "ASSISTANT"}</span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>

                        <div className="whitespace-pre-wrap break-words text-sm leading-6">
                          {item.content}
                        </div>

                        {imageUrl ? (
                          <div className="mt-4">
                            <img
                              src={imageUrl}
                              alt="Generated"
                              className="max-h-[420px] w-full rounded-xl border border-slate-700 object-contain"
                            />
                            <a
                              href={imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs text-sky-300 hover:text-sky-200"
                            >
                              Открыть изображение
                            </a>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-4 text-sm font-semibold text-slate-300">Файлы чата</div>

              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  📎 Загрузить файл
                </button>

                {selectedFile ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                    Выбран файл: {selectedFile.name} ({selectedFile.size} bytes)
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={clearSelectedFile}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Очистить выбор
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    {workMode === "image"
                      ? "Файл можно выбрать для будущего режима text + image, но текущий backend его ещё не использует."
                      : "Файл будет отправлен вместе с сообщением."}
                  </div>
                )}

                {loadingAttachments ? (
                  <div className="text-sm text-slate-500">Загрузка вложений...</div>
                ) : attachments.length === 0 ? (
                  <div className="text-sm text-slate-500">Файлы не загружены</div>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                      >
                        <div className="mb-2 text-sm font-medium text-slate-200">
                          {item.original_name || `Файл #${item.id}`}
                        </div>
                        <div className="text-xs text-slate-400">
                          {item.mime_type || "unknown"} · {item.size_bytes ?? 0} bytes
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Статус: {item.parse_status || "unknown"}
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => void handleDeleteAttachment(item)}
                            disabled={deletingAttachmentId === item.id}
                            className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingAttachmentId === item.id
                              ? "Удаление..."
                              : "Удалить файл"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="border-t border-slate-800 bg-slate-900 px-6 py-4">
          {workMode === "chat" ? (
            <form onSubmit={handleSendMessage} className="flex items-end gap-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Введите сообщение..."
                rows={4}
                className="min-h-[96px] flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={sending}
                className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Отправка..." : "Отправить"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleGenerateImage} className="flex items-end gap-3">
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Опиши изображение, которое нужно сгенерировать..."
                rows={4}
                className="min-h-[96px] flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={generatingImage}
                className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingImage ? "Генерация..." : "Сгенерировать"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}