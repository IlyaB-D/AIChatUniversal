"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

type ChatItem = {
  id: number;
  title: string;
  model_slug: string;
  system_prompt?: string | null;
  created_at?: string;
  updated_at?: string;
};

type MessageItem = {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  image_url?: string | null;
  model_slug?: string | null;
  provider_slug?: string | null;
  created_at?: string;
};

type AttachmentItem = {
  id: number;
  chat_id?: number;
  file_name?: string;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  parse_status?: string | null;
  created_at?: string | null;
};

type ModelItem = {
  id?: number;
  slug: string;
  name?: string | null;
  title?: string | null;
  display_name?: string | null;
  provider_slug?: string | null;
  supports_vision?: boolean;
  is_default?: boolean;
  is_active?: boolean;
};

type AuthUser = {
  id: number;
  email: string;
  is_active: boolean;
  total_spent_usd?: number;
  spending_limit_usd?: number;
  billing_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

type ViewMode = "chat" | "image";
type AuthMode = "login" | "register";

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVisionModel(modelSlug?: string | null) {
  if (!modelSlug) return false;
  return modelSlug.includes("gpt-4.1");
}

function getModelLabel(model: ModelItem) {
  return model.display_name || model.title || model.name || model.slug;
}

function getBackendOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
  ).replace(/\/api\/?$/, "");
}

function normalizeImageUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${getBackendOrigin()}${rawUrl}`;
}

export default function Chat() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedDefaultModelSlug, setSelectedDefaultModelSlug] =
    useState<string>("claude-sonnet-4-6");

  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);

  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [updatingModel, setUpdatingModel] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<number | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);

  const [errorText, setErrorText] = useState<string | null>(null);
  const [warningText, setWarningText] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function resetChatState() {
    setChats([]);
    setSelectedChatId(null);
    setMessages([]);
    setAttachments([]);
    setSelectedFiles([]);
    setMessage("");
    setViewMode("chat");
    setErrorText(null);
    setWarningText(null);
    setCopiedText(null);
  }

  async function loadCurrentUser() {
    const response = await api.get("/auth/me");
    return response.data as AuthUser;
  }

  async function initializeAuth() {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      setIsAuthenticated(false);
      setAuthUser(null);
      setAuthChecking(false);
      return;
    }

    try {
      const me = await loadCurrentUser();
      setAuthUser(me);
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Ошибка проверки токена:", err);
      localStorage.removeItem("access_token");
      setAuthUser(null);
      setIsAuthenticated(false);
    } finally {
      setAuthChecking(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();

    if (!email || !password) {
      setAuthError("Введите email и пароль.");
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError(null);

      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";

      const response = await api.post<AuthResponse>(endpoint, {
        email,
        password,
      });

      localStorage.setItem("access_token", response.data.access_token);
      setAuthUser(response.data.user);
      setIsAuthenticated(true);
      setAuthPassword("");
      setAuthError(null);
      resetChatState();

      await Promise.all([loadModels(), loadChats()]);
    } catch (err: any) {
      console.error("Ошибка авторизации:", err);

      const backendMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        null;

      setAuthError(
        backendMessage ||
          (authMode === "login"
            ? "Не удалось выполнить вход."
            : "Не удалось зарегистрироваться.")
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
    setAuthUser(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthError(null);
    resetChatState();
  }

  async function loadModels() {
    try {
      setLoadingModels(true);

      const response = await api.get("/models");
      const items = response.data?.items ?? response.data ?? [];
      const normalized = Array.isArray(items) ? items : [];

      setModels(normalized);

      const sonnet = normalized.find(
        (item) => item.slug === "claude-sonnet-4-6"
      );
      const defaultModel = normalized.find((item) => item.is_default);
      const firstModel = normalized[0];

      const nextDefault =
        sonnet?.slug ||
        defaultModel?.slug ||
        firstModel?.slug ||
        "claude-sonnet-4-6";

      setSelectedDefaultModelSlug(nextDefault);
    } catch (err) {
      console.error("Ошибка загрузки моделей:", err);
      setErrorText("Не удалось загрузить список моделей.");
    } finally {
      setLoadingModels(false);
    }
  }

  async function loadChats() {
    try {
      setLoadingChats(true);
      setErrorText(null);

      const response = await api.get("/chats");
      const items = response.data?.items ?? response.data ?? [];
      const normalizedChats = Array.isArray(items) ? items : [];
      setChats(normalizedChats);

      if (!selectedChatId && normalizedChats.length > 0) {
        await loadChatHistory(normalizedChats[0].id);
      }
    } catch (err: any) {
      console.error("Ошибка загрузки чатов:", err);

      if (err?.response?.status === 401) {
        await handleLogout();
        return;
      }

      setErrorText("Не удалось загрузить список чатов.");
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadAttachments(chatId: number) {
    try {
      setLoadingAttachments(true);

      const response = await api.get(`/attachments/chat/${chatId}`);
      const items =
        response.data?.items ??
        response.data?.attachments ??
        response.data ??
        [];

      setAttachments(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("Ошибка загрузки вложений:", err);
      setAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  }

  async function loadChatHistory(chatId: number) {
    try {
      setLoadingMessages(true);
      setErrorText(null);
      setWarningText(null);

      const response = await api.get(`/history/${chatId}`);
      const items =
        response.data?.items ??
        response.data?.messages ??
        response.data ??
        [];

      const normalizedMessages: MessageItem[] = (Array.isArray(items) ? items : []).map(
        (msg: MessageItem) => ({
          ...msg,
          image_url: normalizeImageUrl(msg.image_url),
        })
      );

      setMessages(normalizedMessages);
      setSelectedChatId(chatId);
      setSelectedFiles([]);
      setMessage("");
      setViewMode("chat");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadAttachments(chatId);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      setErrorText("Не удалось загрузить историю чата.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleCreateChat() {
    try {
      setCreatingChat(true);
      setErrorText(null);
      setWarningText(null);

      const response = await api.post("/chat/create", {
        title: "Новый чат",
        model_slug: selectedDefaultModelSlug,
      });

      const newChat: ChatItem = response.data;

      await loadChats();
      await loadChatHistory(newChat.id);
    } catch (err) {
      console.error("Ошибка создания чата:", err);
      setErrorText("Не удалось создать новый чат.");
    } finally {
      setCreatingChat(false);
    }
  }

  async function handleRenameChat(chatId: number, currentTitle: string) {
    const raw = window.prompt("Введите новое название чата", currentTitle);
    if (raw === null) return;

    const nextTitle = raw.trim();
    if (!nextTitle) {
      setErrorText("Название чата не может быть пустым.");
      return;
    }

    try {
      setErrorText(null);

      await api.patch(`/chats/${chatId}`, {
        title: nextTitle,
      });

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: nextTitle } : chat
        )
      );
    } catch (err) {
      console.error("Ошибка переименования чата:", err);
      setErrorText("Не удалось переименовать чат.");
    }
  }

  async function handleDeleteChat(chatId: number) {
    const targetChat = chats.find((chat) => chat.id === chatId);
    const confirmed = window.confirm(
      `Удалить чат "${targetChat?.title || `#${chatId}`}"? Это действие нельзя отменить.`
    );

    if (!confirmed) return;

    try {
      setDeletingChatId(chatId);
      setErrorText(null);

      await api.delete(`/chats/${chatId}`);

      const isCurrentChat = selectedChatId === chatId;

      if (isCurrentChat) {
        setSelectedChatId(null);
        setMessages([]);
        setAttachments([]);
        setSelectedFiles([]);
        setMessage("");
        setWarningText(null);
        setViewMode("chat");

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }

      await loadChats();
    } catch (err) {
      console.error("Ошибка удаления чата:", err);
      setErrorText("Не удалось удалить чат.");
    } finally {
      setDeletingChatId(null);
    }
  }

  async function handleDeleteAttachment(attachmentId: number) {
    if (!selectedChatId) return;

    const targetAttachment = attachments.find((item) => item.id === attachmentId);
    const fileName =
      targetAttachment?.original_name ||
      targetAttachment?.file_name ||
      `Файл #${attachmentId}`;

    const confirmed = window.confirm(
      `Удалить файл "${fileName}" из этого чата?`
    );

    if (!confirmed) return;

    try {
      setDeletingAttachmentId(attachmentId);
      setErrorText(null);

      await api.delete(`/attachments/${attachmentId}`);
      await loadAttachments(selectedChatId);
    } catch (err) {
      console.error("Ошибка удаления файла:", err);
      setErrorText("Не удалось удалить файл.");
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function handleChangeChatModel(nextModelSlug: string) {
    if (!selectedChatId) return;
    if (!nextModelSlug.trim()) return;

    const currentChat = chats.find((chat) => chat.id === selectedChatId);
    if (currentChat?.model_slug === nextModelSlug) return;

    const chatHasImages = attachments.some((attachment) =>
      (attachment.mime_type || "").startsWith("image/")
    );

    try {
      setUpdatingModel(true);
      setErrorText(null);

      await api.patch(`/chats/${selectedChatId}`, {
        model_slug: nextModelSlug,
      });

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChatId
            ? { ...chat, model_slug: nextModelSlug }
            : chat
        )
      );

      if (chatHasImages && !isVisionModel(nextModelSlug)) {
        setWarningText(
          `В этом чате уже есть изображения. Модель ${nextModelSlug} может не поддерживать их анализ. Файлы останутся в чате, но для image/vision-запросов лучше использовать gpt-4.1.`
        );
      } else {
        setWarningText(null);
      }
    } catch (err) {
      console.error("Ошибка смены модели:", err);
      setErrorText("Не удалось изменить модель чата.");
    } finally {
      setUpdatingModel(false);
    }
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  }

  function removeSelectedFile(indexToRemove: number) {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));

    if (fileInputRef.current && selectedFiles.length <= 1) {
      fileInputRef.current.value = "";
    }
  }

  async function uploadSelectedFiles(chatId: number) {
    if (!selectedFiles.length) return;

    setUploadingFiles(true);

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("file", file);

        await api.post("/attachments/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      }

      await loadAttachments(chatId);
    } finally {
      setUploadingFiles(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedChatId || sending) return;

    const trimmedMessage = message.trim();
    if (!trimmedMessage && selectedFiles.length === 0) return;

    const selectedChat =
      chats.find((chat) => chat.id === selectedChatId) || null;

    const hasImages = selectedFiles.some(isImageFile);
    const canUseVision = isVisionModel(selectedChat?.model_slug);

    if (hasImages && !canUseVision) {
      setWarningText(
        `В этом чате выбрана модель ${selectedChat?.model_slug}. Сейчас изображения корректно анализируются через vision-модель gpt-4.1. Для описания PNG/JPG открой чат на gpt-4.1.`
      );
    } else {
      setWarningText(null);
    }

    const optimisticUserMessage: MessageItem | null = trimmedMessage
      ? {
          id: Date.now(),
          chat_id: selectedChatId,
          role: "user",
          content: trimmedMessage,
          created_at: new Date().toISOString(),
          model_slug: selectedChat?.model_slug || null,
        }
      : null;

    try {
      setSending(true);
      setErrorText(null);

      if (optimisticUserMessage) {
        setMessages((prev) => [...prev, optimisticUserMessage]);
      }

      setMessage("");

      if (selectedFiles.length > 0) {
        await uploadSelectedFiles(selectedChatId);
      }

      if (!trimmedMessage) {
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      const response = await api.post("/chat/send", {
        chat_id: selectedChatId,
        message: trimmedMessage,
      });

      const data = response.data;

      setMessages((prev) => {
        const withoutOptimistic = optimisticUserMessage
          ? prev.filter((msg) => msg.id !== optimisticUserMessage.id)
          : prev;

        return [
          ...withoutOptimistic,
          {
            ...data.user_message,
            image_url: normalizeImageUrl(data.user_message?.image_url),
          },
          {
            ...data.assistant_message,
            image_url: normalizeImageUrl(data.assistant_message?.image_url),
          },
        ];
      });

      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await Promise.all([loadChats(), loadAttachments(selectedChatId)]);
    } catch (err) {
      console.error("Ошибка отправки сообщения:", err);

      if (optimisticUserMessage) {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticUserMessage.id)
        );
      }

      setMessage(trimmedMessage);
      setErrorText("Не удалось отправить сообщение или загрузить файлы.");
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateImage() {
    if (!selectedChatId) {
      setErrorText("Сначала выберите чат для сохранения изображения.");
      return;
    }

    if (!imagePrompt.trim()) return;

    try {
      setGeneratingImage(true);
      setErrorText(null);

      await api.post("/images/generate", null, {
        params: {
          prompt: imagePrompt.trim(),
          chat_id: selectedChatId,
        },
      });

      setImagePrompt("");
      await loadChatHistory(selectedChatId);
      setViewMode("chat");
    } catch (err) {
      console.error("Ошибка генерации изображения:", err);
      setErrorText("Не удалось сгенерировать изображение.");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function copyToClipboard(text: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(successLabel);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Ошибка копирования:", err);
      setErrorText("Не удалось скопировать текст.");
    }
  }

  function buildChatTranscript(): string {
    if (!selectedChat) return "";

    const lines: string[] = [];
    lines.push(`# ${selectedChat.title}`);
    lines.push(`Модель: ${selectedChat.model_slug}`);
    lines.push("");

    for (const msg of messages) {
      lines.push(`## ${msg.role}`);

      if (msg.content) {
        lines.push(msg.content);
      }

      if (msg.image_url) {
        lines.push(`[image] ${msg.image_url}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  async function handleCopyChat() {
    const transcript = buildChatTranscript();
    if (!transcript) return;

    await copyToClipboard(transcript, "Чат скопирован");
  }

  function handleDownloadChat() {
    const transcript = buildChatTranscript();
    if (!transcript) return;

    const safeTitle = (selectedChat?.title || "chat")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim();

    const blob = new Blob([transcript], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle || "chat"}.md`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function formatTime(value?: string | null) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const selectedChat =
    chats.find((chat) => chat.id === selectedChatId) || null;

  const selectedFilesInfo = useMemo(() => {
    return {
      total: selectedFiles.length,
      images: selectedFiles.filter(isImageFile).length,
      nonImages: selectedFiles.filter((file) => !isImageFile(file)).length,
    };
  }, [selectedFiles]);

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void Promise.all([loadModels(), loadChats()]);
  }, [isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, sending, loadingMessages]);

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f7fb",
          fontFamily: "Inter, Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: 420,
            padding: 28,
            background: "#ffffff",
            borderRadius: 20,
            border: "1px solid #e5e7eb",
            boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
            textAlign: "center",
            color: "#374151",
          }}
        >
          Проверка авторизации...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #f8fbff 0%, #f5f7fb 100%)",
          fontFamily: "Inter, Arial, Helvetica, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 24,
            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#111827",
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            AIChatUniversal
          </div>

          <div
            style={{
              textAlign: "center",
              color: "#6b7280",
              fontSize: 14,
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {authMode === "login"
              ? "Войдите, чтобы открыть свои чаты и продолжить работу."
              : "Создайте аккаунт, чтобы начать работу с чатами и генерацией изображений."}
          </div>

          <div
            style={{
              display: "flex",
              background: "#f3f4f6",
              borderRadius: 14,
              padding: 4,
              gap: 4,
              marginBottom: 18,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
              style={{
                flex: 1,
                height: 42,
                border: "none",
                borderRadius: 10,
                background: authMode === "login" ? "#111827" : "transparent",
                color: authMode === "login" ? "#ffffff" : "#374151",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Вход
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
              style={{
                flex: 1,
                height: 42,
                border: "none",
                borderRadius: 10,
                background: authMode === "register" ? "#111827" : "transparent",
                color: authMode === "register" ? "#ffffff" : "#374151",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Регистрация
            </button>
          </div>

          {authError && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 14,
              }}
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            <div style={{ marginBottom: 12 }}>
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                autoComplete="email"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #d1d5db",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <input
                type="password"
                placeholder="Пароль"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #d1d5db",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              style={{
                width: "100%",
                height: 50,
                border: "none",
                borderRadius: 16,
                background: "#111827",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 800,
                cursor: authLoading ? "not-allowed" : "pointer",
                opacity: authLoading ? 0.7 : 1,
                boxShadow: "0 10px 24px rgba(17,24,39,0.18)",
              }}
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#f5f7fb",
        color: "#111827",
        fontFamily: "Inter, Arial, Helvetica, sans-serif",
      }}
    >
      <aside
        style={{
          width: 320,
          borderRight: "1px solid #e5e7eb",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)",
          }}
        >
          <button
            onClick={handleCreateChat}
            disabled={creatingChat || loadingModels}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: creatingChat || loadingModels ? "not-allowed" : "pointer",
              boxShadow: "0 6px 20px rgba(17,24,39,0.12)",
              opacity: creatingChat || loadingModels ? 0.7 : 1,
            }}
          >
            {creatingChat ? "Создание..." : "+ Новый чат"}
          </button>

          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748b",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Модель по умолчанию
            </div>

            <select
              value={selectedDefaultModelSlug}
              onChange={(e) => setSelectedDefaultModelSlug(e.target.value)}
              disabled={loadingModels}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                padding: "0 12px",
                fontSize: 14,
                color: "#111827",
                outline: "none",
              }}
            >
              {models.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {getModelLabel(model)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            Аккаунт
          </div>

          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
              marginBottom: 10,
              wordBreak: "break-word",
            }}
          >
            {authUser?.email}
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Выйти
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
          }}
        >
          {loadingChats && (
            <div style={{ padding: 12, color: "#6b7280", fontSize: 14 }}>
              Загрузка чатов...
            </div>
          )}

          {!loadingChats && chats.length === 0 && (
            <div
              style={{
                padding: 12,
                color: "#6b7280",
                fontSize: 14,
                border: "1px dashed #d1d5db",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              Чатов пока нет
            </div>
          )}

          {chats.map((chat) => {
            const isActive = selectedChatId === chat.id;
            const isDeleting = deletingChatId === chat.id;

            return (
              <div
                key={chat.id}
                style={{
                  padding: 14,
                  marginBottom: 10,
                  border: isActive ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                  borderRadius: 14,
                  background: isActive ? "#eff6ff" : "#ffffff",
                  boxShadow: isActive
                    ? "0 8px 24px rgba(59,130,246,0.10)"
                    : "0 2px 8px rgba(15,23,42,0.04)",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    onClick={() => void loadChatHistory(chat.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        lineHeight: 1.3,
                        marginBottom: 6,
                        wordBreak: "break-word",
                      }}
                    >
                      {chat.title}
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: "#475569",
                        background: "#f8fafc",
                        padding: "4px 8px",
                        borderRadius: 999,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            chat.model_slug?.includes("gpt") ? "#10b981" : "#6366f1",
                          display: "inline-block",
                        }}
                      />
                      {chat.model_slug}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRenameChat(chat.id, chat.title)}
                      title="Переименовать чат"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#475569",
                        cursor: "pointer",
                        fontSize: 15,
                        lineHeight: 1,
                        padding: 4,
                      }}
                    >
                      ✎
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeleteChat(chat.id)}
                      disabled={isDeleting}
                      title="Удалить чат"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ef4444",
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 4,
                      }}
                    >
                      {isDeleting ? "…" : "✕"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div
          style={{
            minHeight: 72,
            borderBottom: "1px solid #e5e7eb",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selectedChat ? selectedChat.title : "AIChatUniversal"}
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {selectedChat
                ? `Модель чата: ${selectedChat.model_slug}`
                : "Выбери чат слева или создай новый"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#f3f4f6",
                borderRadius: 12,
                padding: 4,
                gap: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("chat")}
                style={{
                  height: 34,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 10,
                  background: viewMode === "chat" ? "#111827" : "transparent",
                  color: viewMode === "chat" ? "#ffffff" : "#374151",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                💬 Чат
              </button>

              <button
                type="button"
                onClick={() => setViewMode("image")}
                style={{
                  height: 34,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 10,
                  background: viewMode === "image" ? "#111827" : "transparent",
                  color: viewMode === "image" ? "#ffffff" : "#374151",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🎨 Изображение
              </button>
            </div>

            {selectedChat && (
              <button
                type="button"
                onClick={() => void handleRenameChat(selectedChat.id, selectedChat.title)}
                style={{
                  height: 42,
                  padding: "0 14px",
                  border: "1px solid #d1d5db",
                  borderRadius: 12,
                  background: "#ffffff",
                  color: "#111827",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ✏ Переименовать
              </button>
            )}

            {selectedChat && viewMode === "chat" && (
              <>
                <button
                  type="button"
                  onClick={() => void handleCopyChat()}
                  style={{
                    height: 42,
                    padding: "0 14px",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  📋 Копировать чат
                </button>

                <button
                  type="button"
                  onClick={handleDownloadChat}
                  style={{
                    height: 42,
                    padding: "0 14px",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ⬇ Скачать .md
                </button>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Модель текущего чата
                  </div>

                  <select
                    value={selectedChat.model_slug}
                    onChange={(e) => void handleChangeChatModel(e.target.value)}
                    disabled={updatingModel || loadingModels}
                    style={{
                      minWidth: 240,
                      height: 42,
                      borderRadius: 12,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      padding: "0 12px",
                      fontSize: 14,
                      color: "#111827",
                      outline: "none",
                    }}
                  >
                    {models.map((model) => (
                      <option key={model.slug} value={model.slug}>
                        {getModelLabel(model)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {copiedText && (
          <div
            style={{
              margin: "16px 20px 0",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              fontSize: 14,
            }}
          >
            {copiedText}
          </div>
        )}

        {warningText && (
          <div
            style={{
              margin: "16px 20px 0",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e",
              fontSize: 14,
            }}
          >
            {warningText}
          </div>
        )}

        {errorText && (
          <div
            style={{
              margin: "16px 20px 0",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 14,
            }}
          >
            {errorText}
          </div>
        )}

        {viewMode === "chat" && selectedChatId && (
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid #eef2f7",
              background: "#fcfdff",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 8,
              }}
            >
              Вложения чата
            </div>

            {loadingAttachments ? (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Загрузка вложений...
              </div>
            ) : attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                Пока нет вложений
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {attachments.map((attachment) => {
                  const isDeletingAttachment = deletingAttachmentId === attachment.id;

                  return (
                    <div
                      key={attachment.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #dbeafe",
                        background: "#eff6ff",
                        fontSize: 12,
                        color: "#1e3a8a",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {attachment.original_name ||
                            attachment.file_name ||
                            `Файл #${attachment.id}`}
                        </div>
                        <div style={{ marginTop: 4, color: "#64748b" }}>
                          status: {attachment.parse_status || "unknown"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteAttachment(attachment.id)}
                        disabled={isDeletingAttachment}
                        title="Удалить файл"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#ef4444",
                          cursor: isDeletingAttachment ? "not-allowed" : "pointer",
                          fontSize: 15,
                          lineHeight: 1,
                          padding: 2,
                        }}
                      >
                        {isDeletingAttachment ? "…" : "✕"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {viewMode === "chat" && (
          <>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 20px 12px",
                background:
                  "radial-gradient(circle at top, #f8fbff 0%, #f5f7fb 45%, #f5f7fb 100%)",
              }}
            >
              {!selectedChatId && (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      maxWidth: 520,
                      textAlign: "center",
                      padding: 24,
                      borderRadius: 20,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        marginBottom: 10,
                      }}
                    >
                      Добро пожаловать в AIChatUniversal
                    </div>
                    <div
                      style={{
                        color: "#6b7280",
                        lineHeight: 1.6,
                        fontSize: 14,
                      }}
                    >
                      Выбери существующий чат слева или создай новый, чтобы начать
                      диалог.
                    </div>
                  </div>
                </div>
              )}

              {selectedChatId && loadingMessages && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "#e5e7eb",
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          height: 64,
                          width: item % 2 === 0 ? "55%" : "72%",
                          borderRadius: 18,
                          background: "#e5e7eb",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedChatId &&
                !loadingMessages &&
                messages.map((msg) => {
                  const isUser = msg.role === "user";
                  const hasImage = Boolean(msg.image_url);
                  const hasText = Boolean(msg.content?.trim());

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: isUser ? "flex-end" : "flex-start",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: isUser ? "row-reverse" : "row",
                          alignItems: "flex-start",
                          gap: 10,
                          maxWidth: hasImage ? "84%" : "78%",
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#ffffff",
                            background: isUser ? "#3b82f6" : "#111827",
                            flexShrink: 0,
                            boxShadow: "0 6px 18px rgba(15,23,42,0.12)",
                          }}
                        >
                          {isUser ? "U" : "AI"}
                        </div>

                        <div
                          style={{
                            background: isUser ? "#dbeafe" : "#ffffff",
                            color: "#111827",
                            border: isUser
                              ? "1px solid #bfdbfe"
                              : "1px solid #e5e7eb",
                            borderRadius: 20,
                            padding: "12px 14px",
                            boxShadow: "0 6px 18px rgba(15,23,42,0.05)",
                            minWidth: hasImage ? 260 : 120,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: isUser ? "#1d4ed8" : "#6b7280",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.4,
                                }}
                              >
                                {isUser ? "user" : "assistant"}
                              </div>

                              {(hasText || hasImage) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyToClipboard(
                                      hasText
                                        ? msg.content
                                        : msg.image_url || "",
                                      "Сообщение скопировано"
                                    )
                                  }
                                  title="Скопировать сообщение"
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    color: "#6b7280",
                                    padding: 0,
                                  }}
                                >
                                  📋
                                </button>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: "#9ca3af",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatTime(msg.created_at)}
                            </div>
                          </div>

                          {hasText && (
                            <div
                              style={{
                                fontSize: 15,
                                lineHeight: 1.65,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                marginBottom: hasImage ? 12 : 0,
                              }}
                            >
                              {msg.content}
                            </div>
                          )}

                          {hasImage && (
                            <div>
                              <img
                                src={msg.image_url || ""}
                                alt="Generated image"
                                style={{
                                  width: "100%",
                                  maxWidth: 520,
                                  borderRadius: 16,
                                  display: "block",
                                  border: "1px solid #e5e7eb",
                                }}
                              />
                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 12,
                                  color: "#6b7280",
                                }}
                              >
                                Сгенерированное изображение
                              </div>
                            </div>
                          )}

                          {!isUser && (msg.model_slug || msg.provider_slug) && (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: "1px solid #f3f4f6",
                                fontSize: 12,
                                color: "#6b7280",
                              }}
                            >
                              {msg.model_slug ? `model: ${msg.model_slug}` : ""}
                              {msg.model_slug && msg.provider_slug ? " • " : ""}
                              {msg.provider_slug
                                ? `provider: ${msg.provider_slug}`
                                : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {sending && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      maxWidth: "78%",
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#ffffff",
                        background: "#111827",
                        flexShrink: 0,
                        boxShadow: "0 6px 18px rgba(15,23,42,0.12)",
                      }}
                    >
                      AI
                    </div>

                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 20,
                        padding: "14px 16px",
                        boxShadow: "0 6px 18px rgba(15,23,42,0.05)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#9ca3af",
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#9ca3af",
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#9ca3af",
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            color: "#6b7280",
                            marginLeft: 4,
                          }}
                        >
                          Печатает...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: 16,
              }}
            >
              <div
                style={{
                  maxWidth: 980,
                  margin: "0 auto",
                }}
              >
                {selectedChatId && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFilesChange}
                        style={{ display: "none" }}
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || uploadingFiles}
                        style={{
                          height: 42,
                          padding: "0 14px",
                          border: "1px solid #d1d5db",
                          borderRadius: 12,
                          background: "#ffffff",
                          color: "#111827",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor:
                            sending || uploadingFiles ? "not-allowed" : "pointer",
                        }}
                      >
                        📎 Прикрепить файлы
                      </button>

                      {selectedFilesInfo.total > 0 && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#475569",
                          }}
                        >
                          Выбрано: {selectedFilesInfo.total} · изображений:{" "}
                          {selectedFilesInfo.images} · других файлов:{" "}
                          {selectedFilesInfo.nonImages}
                        </div>
                      )}
                    </div>

                    {selectedFiles.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {selectedFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${file.lastModified}-${index}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#f8fafc",
                              fontSize: 12,
                              color: "#334155",
                            }}
                          >
                            <span>{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeSelectedFile(index)}
                              disabled={sending || uploadingFiles}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor:
                                  sending || uploadingFiles
                                    ? "not-allowed"
                                    : "pointer",
                                color: "#ef4444",
                                fontWeight: 700,
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <textarea
                      placeholder={
                        selectedChatId
                          ? "Введите сообщение..."
                          : "Сначала выберите чат"
                      }
                      value={message}
                      disabled={!selectedChatId || sending || uploadingFiles}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      rows={1}
                      style={{
                        width: "100%",
                        minHeight: 54,
                        maxHeight: 180,
                        resize: "vertical",
                        padding: "14px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: 16,
                        outline: "none",
                        fontSize: 15,
                        lineHeight: 1.5,
                        background:
                          !selectedChatId || sending || uploadingFiles
                            ? "#f9fafb"
                            : "#ffffff",
                        color: "#111827",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    onClick={() => void handleSendMessage()}
                    disabled={
                      !selectedChatId ||
                      sending ||
                      uploadingFiles ||
                      (!message.trim() && selectedFiles.length === 0)
                    }
                    style={{
                      height: 54,
                      minWidth: 130,
                      border: "none",
                      borderRadius: 16,
                      background:
                        !selectedChatId ||
                        sending ||
                        uploadingFiles ||
                        (!message.trim() && selectedFiles.length === 0)
                          ? "#d1d5db"
                          : "#111827",
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor:
                        !selectedChatId ||
                        sending ||
                        uploadingFiles ||
                        (!message.trim() && selectedFiles.length === 0)
                          ? "not-allowed"
                          : "pointer",
                      boxShadow:
                        !selectedChatId ||
                        sending ||
                        uploadingFiles ||
                        (!message.trim() && selectedFiles.length === 0)
                          ? "none"
                          : "0 8px 20px rgba(17,24,39,0.16)",
                    }}
                  >
                    {uploadingFiles
                      ? "Загрузка..."
                      : sending
                        ? "Отправка..."
                        : "Отправить"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {viewMode === "image" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px",
              background:
                "radial-gradient(circle at top, #f8fbff 0%, #f5f7fb 45%, #f5f7fb 100%)",
            }}
          >
            <div
              style={{
                maxWidth: 1100,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 20,
                  background: "#ffffff",
                  padding: 20,
                  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Генерация изображений
                </div>

                <div
                  style={{
                    fontSize: 14,
                    color: "#6b7280",
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  Изображение будет сохранено в текущий чат и появится в истории
                  сообщений.
                </div>

                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Например: futuristic robot in neon city, cinematic lighting"
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    minHeight: 100,
                    padding: "14px 16px",
                    border: "1px solid #d1d5db",
                    borderRadius: 16,
                    outline: "none",
                    fontSize: 15,
                    lineHeight: 1.5,
                    boxSizing: "border-box",
                  }}
                />

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleGenerateImage()}
                    disabled={generatingImage || !imagePrompt.trim() || !selectedChatId}
                    style={{
                      height: 46,
                      padding: "0 18px",
                      border: "none",
                      borderRadius: 14,
                      background:
                        generatingImage || !imagePrompt.trim() || !selectedChatId
                          ? "#d1d5db"
                          : "#111827",
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor:
                        generatingImage || !imagePrompt.trim() || !selectedChatId
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {generatingImage ? "Генерация..." : "Сгенерировать"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setImagePrompt("")}
                    disabled={generatingImage || !imagePrompt}
                    style={{
                      height: 46,
                      padding: "0 18px",
                      border: "1px solid #d1d5db",
                      borderRadius: 14,
                      background: "#ffffff",
                      color: "#111827",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor:
                        generatingImage || !imagePrompt
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Очистить
                  </button>
                </div>

                {!selectedChatId && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: "#92400e",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      padding: "10px 12px",
                      borderRadius: 12,
                    }}
                  >
                    Сначала выбери чат слева. Изображение будет сохранено именно в него.
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px dashed #d1d5db",
                  borderRadius: 20,
                  background: "#ffffff",
                  padding: 28,
                  textAlign: "center",
                  color: "#6b7280",
                }}
              >
                После генерации изображение автоматически появится в истории чата.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}