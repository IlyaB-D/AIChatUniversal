const API = process.env.NEXT_PUBLIC_API_URL;

export async function getChats() {
  const res = await fetch(`${API}/chats`);
  return res.json();
}

export async function createChat() {
  const res = await fetch(`${API}/chat/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Новый чат" }),
  });
  return res.json();
}

export async function getHistory(chatId: number) {
  const res = await fetch(`${API}/history/${chatId}`);
  return res.json();
}

export async function sendMessage(chatId: number, message: string) {
  const res = await fetch(`${API}/chat/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      message,
    }),
  });

  return res.json();
}