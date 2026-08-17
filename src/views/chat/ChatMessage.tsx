import { memo } from "react";
import { formatDuration } from "../../lib/format";
import { isUsefulThink, splitThink, visibleAnswer } from "../../lib/think";
import { Button } from "../../ui/controls";
import { IconCopy, IconRefresh } from "../../ui/icons";
import { Markdown } from "./Markdown";

export const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  return <p className="msg-user">{text}</p>;
});

export const AssistantMessage = memo(function AssistantMessage({
  text,
  streaming,
  onCopy,
  onRegenerate,
  copied,
  showThinking = true,
  durationMs,
}: {
  text: string;
  streaming?: boolean;
  onCopy?: (visible: string) => void;
  onRegenerate?: () => void;
  copied?: boolean;
  showThinking?: boolean;
  durationMs?: number | null;
}) {
  const { thinking, answer, thinkingOpen } = splitThink(text);
  const waiting = Boolean(streaming && !answer.trim() && !thinking);
  const usefulThink = isUsefulThink(thinking);
  const revealThink = usefulThink && showThinking;
  const time = formatDuration(durationMs);

  return (
    <div className={streaming ? "msg-assistant is-live" : "msg-assistant"}>
      {revealThink && (
        <details
          className="msg-think"
          {...(streaming && (thinkingOpen || !answer.trim()) ? { open: true } : {})}
        >
          <summary>{streaming && thinkingOpen ? "Sta ragionando…" : "Ragionamento"}</summary>
          <div className="msg-think-body">
            {thinking}
            {streaming && thinkingOpen ? <span className="msg-caret" /> : null}
          </div>
        </details>
      )}
      {!revealThink && streaming && thinkingOpen && !answer.trim() ? (
        <p className="msg-meta">Sta ragionando…</p>
      ) : null}
      {waiting ? (
        <Markdown text="Sto preparando la risposta…" caret />
      ) : answer.trim() ? (
        <Markdown text={answer} caret={streaming && !thinkingOpen} streaming={streaming} />
      ) : null}
      {(time || onCopy || onRegenerate) && !streaming && (
        <div className="msg-foot">
          {time ? <span className="msg-time">{time}</span> : null}
          {(onCopy || onRegenerate) && (
            <div className="msg-actions">
              {onCopy && (
                <Button variant="ghost" onClick={() => onCopy(visibleAnswer(text))}>
                  <IconCopy size={14} />
                  {copied ? "Copiato" : "Copia"}
                </Button>
              )}
              {onRegenerate && (
                <Button variant="ghost" onClick={onRegenerate}>
                  <IconRefresh size={14} />
                  Rigenera
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {streaming && time ? <p className="msg-time is-live">{time}</p> : null}
    </div>
  );
});
