export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type LlmProvider = "gemini" | "openai";
