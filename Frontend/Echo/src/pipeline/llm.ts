export type Message = { role: "user" | "assistant"; content: string };

export async function getResponse(messages: Message[]): Promise<string> {
  let res;
  try {
    res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });
  } catch {
    res = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Response generation failed");
  }

  const data = await res.json();
  return data.reply ?? "";
}
