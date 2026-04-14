"use client";

import { useEffect, useState } from "react";
import {
  getChats,
  createChat,
  getHistory,
  sendMessage,
} from "@/lib/api";

export default function Chat() {
  const [chats, setChats] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getChats().then(setChats);
  }, []);

  const handleCreateChat = async () => {
    const chat = await createChat();
    setChats(prev => [chat, ...prev]);
  };

  const handleLoadChat = async (id: number) => {
    setChatId(id);
    const history = await getHistory(id);
    setMessages(history);
  };

  const handleSend = async () => {
    if (!chatId || !message) return;

    const res = await sendMessage(chatId, message);

    setMessages(prev => [
      ...prev,
      res.user_message,
      res.assistant_message,
    ]);

    setMessage("");
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <div style={{ width: 300, borderRight: "1px solid #ccc", padding: 10 }}>
        <button onClick={handleCreateChat}>+ Новый чат</button>

        {chats.map(chat => (
          <div
            key={chat.id}
            onClick={() => handleLoadChat(chat.id)}
            style={{ cursor: "pointer", marginTop: 10 }}
          >
            {chat.title}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, padding: 10 }}>
        <div style={{ height: "80%", overflow: "auto" }}>
          {messages.map((m, i) => (
            <div key={i}>
              <b>{m.role}:</b> {m.content}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10 }}>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ width: "80%" }}
          />
          <button onClick={handleSend}>Отправить</button>
        </div>
      </div>
    </div>
  );
}