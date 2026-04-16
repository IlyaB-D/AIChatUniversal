"use client";

import { useEffect, useState } from "react";
import {
  getChats,
  createChat,
  getHistory,
  sendMessage,
} from "@/lib/api";

type ChatItem = {
  id: number;
  title: string;
  model_slug?: string;
};

type MessageItem = {
  id?: number;
  role: string;
  content: string;
};

export default function Chat() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadChats = async () => {
      try {
        const items = await getChats();
        setChats(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("Ошибка загрузки чатов:", error);
      }
    };

    loadChats();
  }, []);

  const handleCreateChat = async () => {
    try {
      const chat = await createChat({
        title: "Новый чат",
        model_slug: "gpt-4.1",
        system_prompt: "",
      });

      setChats((prev) => [chat, ...prev]);
      setChatId(chat.id);
      setMessages([]);
    } catch (error) {
      console.error("Ошибка создания чата:", error);
    }
  };

  const handleLoadChat = async (id: number) => {
    try {
      setChatId(id);
      const history = await getHistory(id);
      setMessages(Array.isArray(history) ? history : []);
    } catch (error) {
      console.error("Ошибка загрузки истории:", error);
    }
  };

  const handleSend = async () => {
    if (!chatId || !message.trim()) {
      return;
    }

    try {
      const userText = message.trim();

      const response = await sendMessage({
        chat_id: chatId,
        message: userText,
      });

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userText },
        response,
      ]);

      setMessage("");
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 300, borderRight: "1px solid #ccc", padding: 10 }}>
        <button onClick={handleCreateChat}>+ Новый чат</button>

        {chats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => handleLoadChat(chat.id)}
            style={{ cursor: "pointer", marginTop: 10 }}
          >
            {chat.title}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: 10 }}>
        <div style={{ height: "80%", overflow: "auto" }}>
          {messages.map((m, i) => (
            <div key={m.id ?? i}>
              <b>{m.role}:</b> {m.content}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ width: "80%" }}
          />
          <button onClick={handleSend}>Отправить</button>
        </div>
      </div>
    </div>
  );
}