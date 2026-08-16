export type RuntimePhase =
  | "spento"
  | "motore"
  | "avvio"
  | "pronto"
  | "inRisposta"
  | "errore";

export type RuntimeSnapshot = {
  phase: RuntimePhase;
  phaseLabel: string;
  message: string;
  modelName: string | null;
  modelId: string | null;
  variantId: string | null;
  deviceLabel: string;
  engineReady: boolean;
  receivedBytes: number;
  expectedBytes: number;
  errorDetail: string | null;
  outcome: string | null;
  profileLabel: string | null;
  profile: "risparmio" | "bilanciato" | "massime" | null;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type TokenChunk = {
  text: string;
};

export function isBusy(snapshot: RuntimeSnapshot | null): boolean {
  return (
    snapshot?.phase === "motore" ||
    snapshot?.phase === "avvio" ||
    snapshot?.phase === "inRisposta"
  );
}

export function canChat(snapshot: RuntimeSnapshot | null): boolean {
  return snapshot?.phase === "pronto";
}
