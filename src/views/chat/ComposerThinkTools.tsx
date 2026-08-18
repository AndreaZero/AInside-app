import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { Button } from "../../ui/controls";
import { IconEye, IconSpark } from "../../ui/icons";
import { Tooltip } from "../../ui/overlays";

export function ComposerThinkTools({
  thinkingOn,
  showThinking,
  onToggleThinking,
  onToggleShow,
  extra,
}: {
  thinkingOn: boolean;
  showThinking: boolean;
  onToggleThinking: () => void;
  onToggleShow: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="chat-composer-tools">
      <Tooltip label={thinkingOn ? "Spegni ragionamento" : "Accendi ragionamento"}>
        <Button
          variant="icon"
          className={cx(thinkingOn && "is-on")}
          aria-pressed={thinkingOn}
          aria-label={thinkingOn ? "Spegni ragionamento" : "Accendi ragionamento"}
          onClick={onToggleThinking}
        >
          <IconSpark size={14} />
        </Button>
      </Tooltip>
      <Tooltip label={showThinking ? "Nascondi ragionamento" : "Mostra ragionamento"}>
        <Button
          variant="icon"
          className={cx(showThinking && "is-on")}
          aria-pressed={showThinking}
          aria-label={showThinking ? "Nascondi ragionamento" : "Mostra ragionamento"}
          onClick={onToggleShow}
        >
          <IconEye size={14} />
        </Button>
      </Tooltip>
      {extra}
    </div>
  );
}
