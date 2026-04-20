import axios from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
});

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
};

export type UserMe = {
  id: number;
  email: string;
  is_active: boolean;
  total_spent_usd?: number;
  spending_limit_usd?: number;
  billing_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user?: UserMe;
};

export type ModelItem = {
  id?: number;
  slug: string;
  name: string;
  provider?: string | null;
  provider_slug?: string | null;
  modality?: string | null;
  supports_vision?: boolean;
  supports_files?: boolean;
  is_default?: boolean;
  is_active?: boolean;
};

export type ChatItem = {
  id: number;
  user_id?: number;
  title: string;
  model_slug: string;
  system_prompt?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MessageItem = {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  image_url?: string | null;
  provider_slug?: string | null;
  model_slug?: string | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_cost?: number;
  output_cost?: number;
  total_cost?: number;
  created_at?: string;
};

export type AttachmentItem = {
  id: number;
  user_id?: number | null;
  chat_id?: number | null;
  message_id?: number | null;
  storage_type?: string | null;
  file_path?: string | null;
  original_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  extracted_text?: string | null;
  parse_status?: string | null;
  created_at?: string;
};

export type CreateChatPayload = {
  title?: string;
  model_slug: string;
  system_prompt?: string | null;
};

export type UpdateChatPayload = {
  title?: string;
  model_slug?: string;
  system_prompt?: string | null;
};

export type SendMessagePayload = {
  chat_id: number;
  message: string;
  model_slug?: string;
};

export type GenerateImageResponse = {
  image_url?: string;
  message?: MessageItem | Record<string, unknown>;
  assistant_message?: MessageItem | Record<string, unknown>;
  item?: MessageItem | Record<string, unknown>;
  [key: string]: unknown;
};

export function setAuthToken(token: string | null): void {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
    }
  } else {
    delete api.defaults.headers.common.Authorization;
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
    }
  }
}

export function initAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const token = localStorage.getItem("access_token");
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
  return token;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", payload);
  return data;
}

export async function getMe(): Promise<UserMe> {
  const { data } = await api.get<UserMe>("/auth/me");
  return data;
}

export async function getModels(): Promise<ModelItem[]> {
  const { data } = await api.get<ModelItem[] | { items: ModelItem[] }>("/models");
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? [];
}

export async function getChats(): Promise<ChatItem[]> {
  const { data } = await api.get<ChatItem[] | { items: ChatItem[] }>("/chats");
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? [];
}

export async function createChat(payload: CreateChatPayload): Promise<ChatItem> {
  const { data } = await api.post<ChatItem>("/chat/create", payload);
  return data;
}

export async function updateChat(
  chatId: number,
  payload: UpdateChatPayload
): Promise<ChatItem> {
  const { data } = await api.patch<ChatItem>(`/chats/${chatId}`, payload);
  return data;
}

export async function deleteChat(chatId: number): Promise<void> {
  await api.delete(`/chats/${chatId}`);
}

export async function getHistory(chatId: number): Promise<MessageItem[]> {
  const { data } = await api.get<MessageItem[] | { items: MessageItem[] }>(
    `/history/${chatId}`
  );
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? [];
}

export async function sendMessage(
  payload: SendMessagePayload
): Promise<MessageItem | Record<string, unknown> | string> {
  const { data } = await api.post("/chat/send", payload);
  return data;
}

export async function sendMessageWithAttachment(payload: {
  chat_id: number;
  message: string;
  model_slug?: string;
  file: File;
}): Promise<MessageItem | Record<string, unknown> | string> {
  const formData = new FormData();
  formData.append("chat_id", String(payload.chat_id));
  formData.append("message", payload.message);
  if (payload.model_slug) {
    formData.append("model_slug", payload.model_slug);
  }
  formData.append("file", payload.file);

  const { data } = await api.post("/chat/send-with-attachment", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
}

export async function getAttachments(chatId: number): Promise<AttachmentItem[]> {
  const { data } = await api.get<AttachmentItem[] | { items: AttachmentItem[] }>(
    `/attachments/chat/${chatId}`
  );
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? [];
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await api.delete(`/attachments/${attachmentId}`);
}

export async function generateImage(payload: {
  prompt: string;
  chat_id: number;
}): Promise<GenerateImageResponse | Record<string, unknown> | string> {
  const { data } = await api.post("/images/generate", null, {
    params: {
      prompt: payload.prompt,
      chat_id: payload.chat_id,
    },
  });
  return data;
}
