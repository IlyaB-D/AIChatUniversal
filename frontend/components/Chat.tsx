"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, initAuthToken, setAuthToken } from "@/lib/api";

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

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

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
    const token = initAuthToken();

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
      setAuthToken(null);
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

      setAuthToken(response.data.access_token);
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
    setAuthToken(null);
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

      const response = await api.get("/chats");
      const items = response.data?.items ?? response.data ?? [];
      const normalized = Array.isArray(items) ? items : [];

      setChats(normalized);

      if (normalized.length > 0 && selectedChatId == null) {
        setSelectedChatId(normalized[0].id);
      }
    } catch (err: any) {
      console.error("Ошибка загрузки чатов:", err);

      if (err?.response?.status === 401) {
        setAuthToken(null);
        setIsAuthenticated(false);
        setAuthUser(null);
        resetChatState();
        return;
      }

      setErrorText("Не удалось загрузить список чатов.");
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadMessages(chatId: number) {
    try {
      setLoadingMessages(true);

      const response = await api.get(`/history/${chatId}`);
      const items = response.data?.items ?? response.data ?? [];
      const normalized = Array.isArray(items) ? items : [];

      setMessages(normalized);
    } catch (err) {
      console.error("Ошибка загрузки сообщений:", err);
      setErrorText("Не удалось загрузить историю чата.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadAttachments(chatId: number) {
    try {
      setLoadingAttachments(true);

      const response = await api.get(`/attachments/chat/${chatId}`);
      const items = response.data?.items ?? response.data ?? [];
      const normalized = Array.isArray(items) ? items : [];

      setAttachments(normalized);
    } catch (err) {
      console.error("Ошибка загрузки вложений:", err);
      setAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  }

  async function handleCreateChat() {
    try {
      setCreatingChat(true);
      setErrorText(null);

      const response = await api.post("/chats", {
        title: "Новый чат",
        model_slug: selectedDefaultModelSlug,
        system_prompt: "",
      });

      const createdChat = response.data as ChatItem;

      await loadChats();
      setSelectedChatId(createdChat.id);
      await loadMessages(createdChat.id);
      await loadAttachments(createdChat.id);
    } catch (err) {
      console.error("Ошибка создания чата:", err);
      setErrorText("Не удалось создать новый чат.");
    } finally {
      setCreatingChat(false);
    }
  }

  async function handleSelectChat(chatId: number) {
    setSelectedChatId(chatId);
    await Promise.all([loadMessages(chatId), loadAttachments(chatId)]);
  }

  async function handleSendMessage() {
    if (!selectedChatId || !message.trim()) {
      return;
    }

    try {
      setSending(true);
      setErrorText(null);

      await api.post("/chat", {
        chat_id: selectedChatId,
        message: message.trim(),
        model_slug: selectedChat?.model_slug || selectedDefaultModelSlug,
      });

      setMessage("");
      await loadMessages(selectedChatId);
      await loadChats();
    } catch (err) {
      console.error("Ошибка отправки сообщения:", err);
      setErrorText("Не удалось отправить сообщение.");
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateImage() {
    if (!selectedChatId || !imagePrompt.trim()) {
      return;
    }

    try {
      setGeneratingImage(true);
      setErrorText(null);

      await api.post(
        `/images/generate?prompt=${encodeURIComponent(
          imagePrompt.trim()
        )}&chat_id=${selectedChatId}`
      );

      setImagePrompt("");
      await loadMessages(selectedChatId);
    } catch (err) {
      console.error("Ошибка генерации изображения:", err);
      setErrorText("Не удалось сгенерировать изображение.");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  }

  async function handleUploadFiles() {
    if (!selectedChatId || selectedFiles.length === 0) {
      return;
    }

    try {
      setUploadingFiles(true);
      setErrorText(null);

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("chat_id", String(selectedChatId));
        formData.append("file", file);

        await api.post("/attachments/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      }

      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadAttachments(selectedChatId);
    } catch (err: any) {
      console.error("Ошибка загрузки файлов:", err);

      const backendMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Не удалось загрузить файл.";

      setErrorText(String(backendMessage));
    } finally {
      setUploadingFiles(false);
    }
  }

  async function handleDeleteChat(chatId: number) {
    try {
      setDeletingChatId(chatId);
      setErrorText(null);

      await api.delete(`/chats/${chatId}`);

      const nextChats = chats.filter((chat) => chat.id !== chatId);
      setChats(nextChats);

      if (selectedChatId === chatId) {
        const nextSelected = nextChats[0]?.id ?? null;
        setSelectedChatId(nextSelected);
        setMessages([]);
        setAttachments([]);

        if (nextSelected) {
          await Promise.all([loadMessages(nextSelected), loadAttachments(nextSelected)]);
        }
      }
    } catch (err) {
      console.error("Ошибка удаления чата:", err);
      setErrorText("Не удалось удалить чат.");
    } finally {
      setDeletingChatId(null);
    }
  }

  async function handleDeleteAttachment(attachmentId: number) {
    if (!selectedChatId) return;

    try {
      setDeletingAttachmentId(attachmentId);
      await api.delete(`/attachments/${attachmentId}`);
      await loadAttachments(selectedChatId);
    } catch (err) {
      console.error("Ошибка удаления файла:", err);
      setErrorText("Не удалось удалить файл.");
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function handleChangeChatModel(chatId: number, nextModelSlug: string) {
    try {
      setUpdatingModel(true);
      setErrorText(null);

      await api.patch(`/chats/${chatId}`, {
        model_slug: nextModelSlug,
      });

      await loadChats();
    } catch (err) {
      console.error("Ошибка смены модели:", err);
      setErrorText("Не удалось изменить модель чата.");
    } finally {
      setUpdatingModel(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText("Текст скопирован");
      setTimeout(() => setCopiedText(null), 1500);
    } catch (err) {
      console.error("Ошибка копирования:", err);
      setWarningText("Не удалось скопировать текст.");
      setTimeout(() => setWarningText(null), 1500);
    }
  }

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadModels();
    void loadChats();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selectedChatId) return;
    void loadMessages(selectedChatId);
    void loadAttachments(selectedChatId);
  }, [isAuthenticated, selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

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
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
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
            onClick={handleCreateChat}
            disabled={creatingChat}
            className="mb-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingChat ? "Создание..." : "+ Новый чат"}
          </button>

          <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
            Модель по умолчанию
          </label>
          <select
            value={selectedDefaultModelSlug}
            onChange={(e) => setSelectedDefaultModelSlug(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
          >
            {models.map((model) => (
              <option key={model.slug} value={model.slug}>
                {getModelLabel(model)}
              </option>
            ))}
          </select>
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
                  <div
                    key={chat.id}
                    className={`rounded-xl border p-3 ${
                      isActive
                        ? "border-slate-500 bg-slate-800"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectChat(chat.id)}
                      className="mb-2 block w-full text-left"
                    >
                      <div className="truncate text-sm font-semibold">
                        {chat.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {chat.model_slug}
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <select
                        value={chat.model_slug}
                        onChange={(e) =>
                          void handleChangeChatModel(chat.id, e.target.value)
                        }
                        disabled={updatingModel}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs outline-none"
                      >
                        {models.map((model) => (
                          <option key={model.slug} value={model.slug}>
                            {getModelLabel(model)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleDeleteChat(chat.id)}
                        disabled={deletingChatId === chat.id}
                        className="rounded-lg border border-red-900 px-2 py-2 text-xs text-red-300 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingChatId === chat.id ? "..." : "Удалить"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">
                {currentChat ? currentChat.title : "Выберите чат"}
              </div>
              <div className="text-sm text-slate-400">
                {currentChat
                  ? `Модель: ${currentChat.model_slug}`
                  : "Создайте новый чат или выберите существующий"}
              </div>
            </div>

            <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setViewMode("chat")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  viewMode === "chat"
                    ? "bg-white text-slate-900"
                    : "text-slate-300"
                }`}
              >
                Чат
              </button>
              <button
                type="button"
                onClick={() => setViewMode("image")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  viewMode === "image"
                    ? "bg-white text-slate-900"
                    : "text-slate-300"
                }`}
              >
                Изображение
              </button>
            </div>
          </div>

          {errorText && (
            <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {errorText}
            </div>
          )}

          {warningText && (
            <div className="mt-2 rounded-xl border border-amber-900 bg-amber-950 px-4 py-3 text-sm text-amber-200">
              {warningText}
            </div>
          )}

          {copiedText && (
            <div className="mt-2 rounded-xl border border-emerald-900 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
              {copiedText}
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <section className="flex flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingMessages ? (
                <div className="text-sm text-slate-400">Загрузка сообщений...</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-slate-400">
                  Сообщений пока нет
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((item) => (
                    <div
                      key={item.id}
                      className={`max-w-3xl rounded-2xl border p-4 ${
                        item.role === "user"
                          ? "ml-auto border-slate-700 bg-slate-800"
                          : "border-slate-800 bg-slate-900"
                      }`}
                    >
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                        {item.role}
                      </div>

                      {item.image_url ? (
                        <div className="space-y-3">
                          <img
                            src={normalizeImageUrl(item.image_url) || ""}
                            alt="generated"
                            className="max-h-[420px] rounded-xl border border-slate-800"
                          />
                          {item.content ? (
                            <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">
                              {item.content}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">
                          {item.content}
                        </div>
                      )}

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void copyText(item.content || "")}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Копировать
                        </button>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 bg-slate-900 px-6 py-4">
              {viewMode === "chat" ? (
                <div className="space-y-3">
                  <div className="flex items-end gap-3">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Введите сообщение..."
                      rows={3}
                      className="min-h-[90px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!selectedChatId || sending || !message.trim()}
                      className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? "Отправка..." : "Отправить"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => void handleFileChange(e)}
                      className="block text-sm text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={handleUploadFiles}
                      disabled={
                        !selectedChatId ||
                        uploadingFiles ||
                        selectedFiles.length === 0
                      }
                      className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingFiles ? "Загрузка..." : "Загрузить файлы"}
                    </button>

                    {selectedFiles.length > 0 && (
                      <div className="text-sm text-slate-400">
                        Выбрано файлов: {selectedFiles.length}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-3">
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Опишите изображение..."
                    rows={3}
                    className="min-h-[90px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={!selectedChatId || generatingImage || !imagePrompt.trim()}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generatingImage ? "Генерация..." : "Сгенерировать"}
                  </button>
                </div>
              )}
            </div>
          </section>

          <aside className="w-80 border-l border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 text-sm font-semibold">Файлы чата</div>

            {loadingAttachments ? (
              <div className="text-sm text-slate-400">Загрузка файлов...</div>
            ) : attachments.length === 0 ? (
              <div className="text-sm text-slate-400">Файлы не загружены</div>
            ) : (
              <div className="space-y-3">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <div className="break-words text-sm font-medium text-slate-100">
                      {attachment.original_name || attachment.file_name || `Файл #${attachment.id}`}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      {attachment.mime_type || "unknown"} ·{" "}
                      {attachment.size_bytes ?? 0} bytes
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      status: {attachment.parse_status || "unknown"}
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleDeleteAttachment(attachment.id)}
                        disabled={deletingAttachmentId === attachment.id}
                        className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingAttachmentId === attachment.id
                          ? "Удаление..."
                          : "Удалить"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}