import type { CodePatch } from "./workspace";

export type SessionKind = "chat" | "code";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  durationMs?: number | null;
  patches?: CodePatch[] | null;
};

export type { CodePatch };

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  modelId: string | null;
  modelName: string | null;
  variantId: string | null;
  archived?: boolean;
  kind?: SessionKind;
  workspacePath?: string | null;
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

export function sessionKind(session: ChatSession | null | undefined): SessionKind {
  return session?.kind === "code" ? "code" : "chat";
}

export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
