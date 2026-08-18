import { useState, type PointerEvent } from "react";
import { useStickToBottom } from "../../hooks/useStickToBottom";
import { cx } from "../../lib/cx";
import { Button } from "../../ui/controls";
import {
  IconClose,
  IconPanelBottom,
  IconPanelFloat,
  IconPanelSide,
  IconSend,
  IconStop,
  IconTerminal,
} from "../../ui/icons";
import { Tooltip } from "../../ui/overlays";

export type TermDock = "bottom" | "side" | "float";

const DOCKS: { id: TermDock; label: string; icon: typeof IconPanelBottom }[] = [
  { id: "bottom", label: "In basso", icon: IconPanelBottom },
  { id: "side", label: "Di lato", icon: IconPanelSide },
  { id: "float", label: "Staccato", icon: IconPanelFloat },
];

export function CodeTerminal({
  open,
  folder,
  folderPath,
  running,
  busy,
  log,
  error,
  dock,
  onDock,
  onOpen,
  onClose,
  onRun,
  onStop,
  onResizeStart,
}: {
  open: boolean;
  folder: string;
  folderPath?: string;
  running: boolean;
  busy: boolean;
  log: string;
  error: string | null;
  dock: TermDock;
  onDock: (dock: TermDock) => void;
  onOpen: () => void;
  onClose: () => void;
  onRun: (command: string) => Promise<boolean>;
  onStop: () => void;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const [line, setLine] = useState("");
  const stick = useStickToBottom();
  const locked = running || busy;

  if (!open) {
    return (
      <button type="button" className="code-term-tab" onClick={onOpen}>
        <IconTerminal size={14} />
        Terminale
        {running ? <span className="code-term-live">in corso</span> : null}
      </button>
    );
  }

  async function submit() {
    const command = line.trim();
    if (!command || locked) return;
    const ok = await onRun(command);
    if (ok) setLine("");
  }

  return (
    <section className={cx("code-term", `is-${dock}`)} aria-label="Terminale">
      <div
        className="code-term-resize"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation={dock === "side" ? "vertical" : "horizontal"}
        aria-label="Ridimensiona il terminale"
      />
      <header className="code-term-head">
        <IconTerminal size={14} />
        <span className="code-term-title">Terminale</span>
        {running ? <span className="code-term-dot" aria-hidden /> : null}
        <span className="code-term-cwd" title={folderPath ?? folder}>
          {folder}
        </span>
        <div className="code-term-docks">
          {DOCKS.map((item) => (
            <Tooltip key={item.id} label={item.label}>
              <Button
                variant="icon"
                className={cx(dock === item.id && "is-on")}
                aria-label={item.label}
                aria-pressed={dock === item.id}
                onClick={() => onDock(item.id)}
              >
                <item.icon size={14} />
              </Button>
            </Tooltip>
          ))}
        </div>
        {running ? (
          <Button variant="ghost" onClick={onStop} aria-label="Ferma il comando">
            <IconStop size={14} />
            Stop
          </Button>
        ) : null}
        <Button variant="icon" aria-label="Chiudi terminale" onClick={onClose}>
          <IconClose size={14} />
        </Button>
      </header>
      <div className="code-term-log" ref={stick.ref} onScroll={stick.onScroll}>
        <div ref={stick.innerRef}>
          <pre className={cx("code-term-pre", !log.trim() && "is-empty")}>
            {log.trim()
              ? log
              : "I comandi partono in questa cartella. Puoi fermarli in qualsiasi momento."}
          </pre>
        </div>
      </div>
      {error ? <p className="code-term-err">{error}</p> : null}
      <form
        className="code-term-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="code-term-prompt" aria-hidden>
          ›
        </span>
        <input
          type="text"
          value={line}
          disabled={locked}
          placeholder={running ? "Comando in corso…" : "Comando in questa cartella"}
          aria-label="Comando"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setLine(event.target.value)}
        />
        {running ? (
          <Button variant="ghost" onClick={onStop}>
            <IconStop size={14} />
            Stop
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={busy || !line.trim()}>
            <IconSend size={14} />
            Avvia
          </Button>
        )}
      </form>
    </section>
  );
}
