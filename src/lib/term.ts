import { invoke } from "@tauri-apps/api/core";

export type TermGrant = "once" | "session" | "folder" | "always";

export type TermStatus = {
  id: number;
  running: boolean;
  command: string;
  code: number | null;
  message: string | null;
};

export type TermChunk = {
  id: number;
  text: string;
};

export function termRun(
  root: string,
  command: string,
  grant?: TermGrant | null,
): Promise<TermStatus> {
  return invoke<TermStatus>("term_run", {
    root,
    command,
    grant: grant ?? null,
  });
}

export function termStop(): Promise<TermStatus> {
  return invoke<TermStatus>("term_stop");
}

export function termStatus(): Promise<TermStatus> {
  return invoke<TermStatus>("term_status");
}

export function termError(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
