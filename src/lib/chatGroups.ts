import { sessionKind, type ChatSession, type SessionKind } from "./chat";

export type ChatGroupId = "oggi" | "ieri" | "prima";

export const CHAT_GROUP_LABEL: Record<ChatGroupId, string> = {
  oggi: "Oggi",
  ieri: "Ieri",
  prima: "Prima",
};

function dayKey(value: string): string | null {
  const numeric = Number(value);
  const date =
    Number.isFinite(numeric) && value.trim() !== "" ? new Date(numeric) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function shiftDay(base: Date, days: number): string {
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return `${next.getFullYear()}-${next.getMonth()}-${next.getDate()}`;
}

export function archivedSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.filter((item) => item.archived);
}

export function sessionsOfKind(
  sessions: ChatSession[],
  kind: SessionKind,
): ChatSession[] {
  return sessions.filter((item) => sessionKind(item) === kind);
}

export function groupSessions(sessions: ChatSession[]): {
  id: ChatGroupId;
  label: string;
  items: ChatSession[];
}[] {
  const now = new Date();
  const today = shiftDay(now, 0);
  const yesterday = shiftDay(now, -1);
  const buckets: Record<ChatGroupId, ChatSession[]> = {
    oggi: [],
    ieri: [],
    prima: [],
  };

  for (const session of sessions) {
    if (session.archived) continue;
    const key = dayKey(session.updatedAt);
    if (key === today) buckets.oggi.push(session);
    else if (key === yesterday) buckets.ieri.push(session);
    else buckets.prima.push(session);
  }

  return (["oggi", "ieri", "prima"] as const)
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, label: CHAT_GROUP_LABEL[id], items: buckets[id] }));
}
