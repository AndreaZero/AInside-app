import { useEffect, useRef, useState } from "react";
import { useRuntimeReply, useRuntimeStatus } from "../../hooks/useRuntime";
import { useTokenRate } from "../../hooks/useTokenRate";
import { formatDuration, formatTokenRate } from "../../lib/format";
import { AssistantMessage } from "./ChatMessage";

export function LiveAssistant({ showThinking }: { showThinking: boolean }) {
  const reply = useRuntimeReply();
  const { snapshot } = useRuntimeStatus();
  const elapsed = useGenerationClock(snapshot?.phase === "inRisposta");

  if (reply) {
    return (
      <AssistantMessage
        text={reply}
        streaming
        showThinking={showThinking}
        durationMs={elapsed}
      />
    );
  }
  if (snapshot?.phase === "inRisposta") {
    return (
      <AssistantMessage
        text="Sto preparando la risposta…"
        streaming
        showThinking={showThinking}
        durationMs={elapsed}
      />
    );
  }
  return null;
}

export function LiveStatus({ thinkingOn }: { thinkingOn: boolean }) {
  const reply = useRuntimeReply();
  const { snapshot } = useRuntimeStatus();
  const elapsed = useGenerationClock(snapshot?.phase === "inRisposta");
  const rate = useTokenRate(reply, snapshot?.phase === "inRisposta");

  if (snapshot?.phase !== "inRisposta") return null;
  return (
    <div className="chat-status-line">
      <span>{thinkingOn ? "Ragionamento acceso · generazione…" : "Generazione in corso…"}</span>
      <span>{formatDuration(elapsed)}</span>
      <span>{formatTokenRate(rate)}</span>
    </div>
  );
}

export function StreamSettler({
  onSettle,
}: {
  onSettle: (reply: string, durationMs?: number) => void;
}) {
  const reply = useRuntimeReply();
  const { snapshot, clearReply } = useRuntimeStatus();
  const pending = useRef(false);
  const started = useRef<number | null>(null);
  const replyRef = useRef(reply);
  replyRef.current = reply;

  useEffect(() => {
    if (snapshot?.phase === "inRisposta") {
      pending.current = true;
      if (started.current == null) started.current = Date.now();
      return;
    }
    if (
      pending.current &&
      (snapshot?.phase === "pronto" || snapshot?.phase === "errore")
    ) {
      pending.current = false;
      const text = replyRef.current;
      const durationMs =
        started.current != null ? Date.now() - started.current : undefined;
      started.current = null;
      if (text) onSettle(text, durationMs);
      clearReply();
    }
  }, [snapshot?.phase, onSettle, clearReply]);

  return null;
}

function useGenerationClock(active: boolean): number | null {
  const started = useRef<number | null>(null);
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      started.current = null;
      setMs(null);
      return;
    }
    if (started.current == null) started.current = Date.now();
    setMs(Date.now() - started.current);
    const tick = window.setInterval(() => {
      if (started.current != null) setMs(Date.now() - started.current);
    }, 250);
    return () => window.clearInterval(tick);
  }, [active]);

  return ms;
}
