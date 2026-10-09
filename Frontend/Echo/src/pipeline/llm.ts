const API_BASE = "http://localhost:3000";

export async function getResponse(message: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Response generation failed");
  }

  const data = await res.json();
  return data.reply ?? "";
}
