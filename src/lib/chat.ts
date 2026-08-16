export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  durationMs?: number | null;
};

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  modelId: string | null;
  modelName: string | null;
  variantId: string | null;
  archived?: boolean;
  messages: ChatMessage[];
};

export type ChatSnapshot = {
  currentId: string | null;
  sessions: ChatSession[];
};

export function currentSession(snapshot: ChatSnapshot | null): ChatSession | null {
  if (!snapshot?.currentId) return null;
  return snapshot.sessions.find((item) => item.id === snapshot.currentId) ?? null;
}
