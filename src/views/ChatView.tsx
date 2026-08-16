import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useChats } from "../hooks/useChats";
import { useLibrary, useLibrarySnapshot } from "../hooks/useLibrary";
import { useRuntime } from "../hooks/useRuntime";
import { useSettings } from "../hooks/useSettings";
import { useTokenRate } from "../hooks/useTokenRate";
import type { ChatMessage } from "../lib/chat";
import { cx } from "../lib/cx";
import { formatDuration, formatProgress, formatTokenRate } from "../lib/format";
import { canChat, isBusy } from "../lib/runtime";
import type { RouteId } from "../navigation/routes";
import { Button, StatusBadge } from "../ui/controls";
import { IconEye, IconMore, IconSend, IconSpark, IconStop } from "../ui/icons";
import { MenuItem, Popover, Tooltip, useFeedback } from "../ui/overlays";
import { EmptyState, ErrorState, InlineAlert } from "../ui/states";
import { EmptyGlyph } from "../visuals/DownloadRig";
import { ModelLogo } from "../visuals/ModelLogo";
import { AssistantMessage, UserBubble } from "./chat/ChatMessage";

type ChatViewProps = {
  onNavigate: (route: RouteId) => void;
};

export function ChatView({ onNavigate }: ChatViewProps) {
  const library = useLibrarySnapshot();
  const libraryApi = useLibrary();
  const runtime = useRuntime();
  const chats = useChats();
  const feedback = useFeedback();
  const { settings, changeThinking } = useSettings();
  const thinkingOn = Boolean(settings?.thinking);
  const [showThinking, setShowThinking] = useState(() => {
    try {
      return localStorage.getItem("ainside.chat.showThinking") !== "0";
    } catch {
      return true;
    }
  });
  const settingsProfile = settings?.profile ?? "bilanciato";
  const catalog = useCatalog();
  const active = library.items.find(
    (item) => item.variantId === library.active?.variantId && item.active,
  );
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const asked = useRef(false);
  const pendingReply = useRef(false);
  const genStarted = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const snapshot = runtime.snapshot;
  const currentId = chats.current?.id ?? null;
  const model = useMemo(
    () =>
      active
        ? { modelId: active.modelId, modelName: active.modelName, variantId: active.variantId }
        : undefined,
    [active?.modelId, active?.modelName, active?.variantId],
  );
  const tokenRate = useTokenRate(runtime.reply, snapshot?.phase === "inRisposta");

  useEffect(() => {
    if (pendingReply.current) return;
    const session = chats.snapshot?.sessions.find((item) => item.id === currentId);
    setTurns(session?.messages ?? []);
    runtime.clearReply();
  }, [currentId, chats.snapshot, runtime.clearReply]);

  useEffect(() => {
    if (!active || asked.current) return;
    if (!snapshot || snapshot.phase === "spento") {
      asked.current = true;
      void runtime.load().catch(() => {
        asked.current = false;
      });
    }
  }, [active, snapshot, runtime]);

  useEffect(() => {
    if (snapshot?.phase === "inRisposta") {
      pendingReply.current = true;
      if (genStarted.current == null) genStarted.current = Date.now();
      const tick = window.setInterval(() => {
        if (genStarted.current != null) {
          setElapsedMs(Date.now() - genStarted.current);
        }
      }, 200);
      return () => window.clearInterval(tick);
    }
    if (
      pendingReply.current &&
      (snapshot?.phase === "pronto" || snapshot?.phase === "errore")
    ) {
      pendingReply.current = false;
      const durationMs =
        genStarted.current != null ? Date.now() - genStarted.current : undefined;
      genStarted.current = null;
      setElapsedMs(null);
      if (runtime.reply) {
        const reply = runtime.reply;
        setTurns((current) => {
          const next = [
            ...current,
            { role: "assistant" as const, content: reply, durationMs },
          ];
          void chats.save(next, model);
          return next;
        });
      }
      runtime.clearReply();
    }
  }, [snapshot?.phase, runtime.reply, runtime.clearReply, chats, model]);

  async function persist(next: ChatMessage[]) {
    setTurns(next);
    await chats.save(next, model);
  }

  async function onSend() {
    const text = input.trim();
    if (!text || !canChat(snapshot)) return;
    setInput("");
    genStarted.current = Date.now();
    setElapsedMs(0);
    const next: ChatMessage[] = [...turns, { role: "user", content: text }];
    pendingReply.current = true;
    await persist(next);
    await runtime.send(next).catch(() => {
      pendingReply.current = false;
    });
  }

  async function onRegenerate() {
    if (!canChat(snapshot) || snapshot?.phase === "inRisposta") return;
    const last = turns[turns.length - 1];
    if (last?.role !== "assistant") return;
    const next = turns.slice(0, -1);
    genStarted.current = Date.now();
    setElapsedMs(0);
    pendingReply.current = true;
    runtime.clearReply();
    await persist(next);
    await runtime.send(next).catch(() => {
      pendingReply.current = false;
    });
  }

  async function onCopy(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  function toggleShowThinking() {
    setShowThinking((value) => {
      const next = !value;
      try {
        localStorage.setItem("ainside.chat.showThinking", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function resize() {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  if (!active && turns.length === 0 && !chats.current) {
    return (
      <section className="page page--fill chat-empty">
        <EmptyState
          visual={<EmptyGlyph />}
          title="Ancora nessuna chat"
          description={
            library.readyCount > 0
              ? "Hai già un modello sul disco. Sceglilo da Modelli con «Usa», poi torna qui."
              : "Qui arrivano le conversazioni. Prima serve un modello sul disco: l’app lo sceglie in base al tuo computer."
          }
          action={<Button variant="primary" onClick={() => onNavigate("models")}>Vai ai modelli</Button>}
        />
      </section>
    );
  }

  const title = chats.current?.title ?? snapshot?.modelName ?? active?.modelName ?? "Chat";
  const downloading = snapshot?.phase === "motore" && snapshot.expectedBytes > 0;
  const lastAssistant = turns.length > 0 && turns[turns.length - 1]?.role === "assistant";
  const readyModels = library.items.filter((item) => item.status === "pronto");
  const localeKind =
    snapshot?.phase === "inRisposta" || snapshot?.phase === "pronto"
      ? "locale"
      : snapshot?.phase === "errore"
        ? "error"
        : snapshot?.phase === "avvio" || snapshot?.phase === "motore"
          ? "run"
          : "paused";

  return (
    <section className="page page--fill">
      <div className="chat-shell">
        <div className="chat-main">
          <header className="chat-head">
            <div className="chat-head-meta">
              <ModelLogo
                seed={active?.modelId ?? "chat"}
                source={
                  catalog.status === "ready" && active
                    ? catalog.catalog.models.find((item) => item.id === active.modelId) ?? {
                        id: active.modelId,
                        name: active.modelName,
                      }
                    : { id: active?.modelId, name: active?.modelName }
                }
                size="sm"
              />
              <Popover
                open={modelOpen}
                onClose={() => setModelOpen(false)}
                content={
                  readyModels.length === 0 ? (
                    <MenuItem onSelect={() => onNavigate("models")}>Scegli un modello</MenuItem>
                  ) : (
                    readyModels.map((item) => (
                      <MenuItem
                        key={item.variantId}
                        onSelect={() => {
                          setModelOpen(false);
                          void libraryApi.useModel(item.modelId, item.variantId);
                        }}
                      >
                        {item.modelName}
                        {item.active ? " · in uso" : ""}
                      </MenuItem>
                    ))
                  )
                }
              >
                <Button variant="ghost" onClick={() => setModelOpen((v) => !v)}>
                  {active?.modelName ?? title}
                </Button>
              </Popover>
              <StatusBadge kind={localeKind === "locale" ? "locale" : localeKind === "error" ? "error" : localeKind === "run" ? "run" : "paused"}>
                {snapshot?.phase === "pronto" || snapshot?.phase === "inRisposta"
                  ? "Locale"
                  : snapshot?.phaseLabel ?? "Locale"}
              </StatusBadge>
              <div className="chat-think-tools">
                <Tooltip label={thinkingOn ? "Spegni ragionamento" : "Accendi ragionamento"}>
                  <Button
                    variant="icon"
                    className={cx(thinkingOn && "is-on")}
                    aria-pressed={thinkingOn}
                    aria-label={thinkingOn ? "Spegni ragionamento" : "Accendi ragionamento"}
                    onClick={() => void changeThinking(!thinkingOn)}
                  >
                    <IconSpark size={15} />
                  </Button>
                </Tooltip>
                <Tooltip label={showThinking ? "Nascondi ragionamento" : "Mostra ragionamento"}>
                  <Button
                    variant="icon"
                    className={cx(showThinking && "is-on")}
                    aria-pressed={showThinking}
                    aria-label={showThinking ? "Nascondi ragionamento" : "Mostra ragionamento"}
                    onClick={toggleShowThinking}
                  >
                    <IconEye size={15} />
                  </Button>
                </Tooltip>
              </div>
            </div>
            <Popover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              align="end"
              content={
                <>
                  {active && snapshot && snapshot.phase !== "spento" && snapshot.phase !== "errore" ? (
                    <MenuItem
                      onSelect={() => {
                        setMenuOpen(false);
                        void runtime.unload();
                      }}
                    >
                      Spegni modello
                    </MenuItem>
                  ) : active ? (
                    <MenuItem
                      onSelect={() => {
                        setMenuOpen(false);
                        void runtime.load();
                      }}
                    >
                      Accendi modello
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      onNavigate("models");
                    }}
                  >
                    Cambia modello
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      void changeThinking(!thinkingOn);
                    }}
                  >
                    {thinkingOn ? "Spegni ragionamento" : "Accendi ragionamento"}
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      toggleShowThinking();
                    }}
                  >
                    {showThinking ? "Nascondi ragionamento" : "Mostra ragionamento"}
                  </MenuItem>
                  {currentId && (
                    <MenuItem
                      danger
                      onSelect={() => {
                        setMenuOpen(false);
                        void feedback
                          .confirm({
                            title: "Togliere questa conversazione?",
                            description: "La chat sparisce da AInside. I file dei modelli restano.",
                            confirmLabel: "Togli",
                            danger: true,
                          })
                          .then((ok) => {
                            if (ok) void chats.remove(currentId);
                          });
                      }}
                    >
                      Togli questa chat
                    </MenuItem>
                  )}
                </>
              }
            >
              <Button variant="icon" aria-label="Menu chat" onClick={() => setMenuOpen((v) => !v)}>
                <IconMore />
              </Button>
            </Popover>
          </header>

          {(runtime.error || snapshot?.phase === "errore") && (
            <div style={{ padding: "12px 22px 0" }}>
              <ErrorState
                title="Impossibile avviare il modello"
                description={runtime.error ?? snapshot?.message ?? "Qualcosa è andato storto."}
                detail={snapshot?.errorDetail}
              />
            </div>
          )}
          {snapshot?.profile &&
            snapshot.phase !== "spento" &&
            snapshot.profile !== settingsProfile && (
              <div style={{ padding: "12px 22px 0" }}>
                <InlineAlert>
                  Hai cambiato il profilo. Spegni e accendi il modello per applicarlo.
                </InlineAlert>
              </div>
            )}
          {chats.error && (
            <div style={{ padding: "12px 22px 0" }}>
              <InlineAlert tone="danger">{chats.error}</InlineAlert>
            </div>
          )}

          <div className="chat-log" aria-live="polite">
            {turns.length === 0 && !runtime.reply && snapshot?.phase !== "inRisposta" && (
              <p className="page-note">
                {snapshot?.outcome ??
                  snapshot?.message ??
                  (active
                    ? "Il modello è locale. Scrivi quando è pronto."
                    : "Scegli un modello per continuare.")}
                {downloading
                  ? ` · ${formatProgress(snapshot.receivedBytes, snapshot.expectedBytes)}`
                  : ""}
              </p>
            )}
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <UserBubble key={`${currentId}-${index}`} text={turn.content} />
              ) : (
                <AssistantMessage
                  key={`${currentId}-${index}`}
                  text={turn.content}
                  copied={copied === index}
                  showThinking={showThinking}
                  durationMs={turn.durationMs}
                  onCopy={(visible) => void onCopy(index, visible)}
                  onRegenerate={
                    index === turns.length - 1 && lastAssistant && canChat(snapshot)
                      ? () => void onRegenerate()
                      : undefined
                  }
                />
              ),
            )}
            {runtime.reply ? (
              <AssistantMessage
                text={runtime.reply}
                streaming
                showThinking={showThinking}
                durationMs={elapsedMs}
              />
            ) : snapshot?.phase === "inRisposta" ? (
              <AssistantMessage
                text="Sto preparando la risposta…"
                streaming
                showThinking={showThinking}
                durationMs={elapsedMs}
              />
            ) : null}
          </div>

          <div className="chat-composer-wrap">
            {snapshot?.phase === "inRisposta" && (
              <div className="chat-status-line">
                <span>{thinkingOn ? "Ragionamento acceso · generazione…" : "Generazione in corso…"}</span>
                <span>{formatDuration(elapsedMs)}</span>
                <span>{formatTokenRate(tokenRate)}</span>
              </div>
            )}
            {(snapshot?.phase === "avvio" || snapshot?.phase === "motore") && (
              <div className="chat-status-line">
                <span>
                  {snapshot.phase === "motore"
                    ? "Caricamento modello in memoria…"
                    : "Avvio modello…"}
                </span>
              </div>
            )}
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void onSend();
              }}
            >
              <textarea
                ref={area}
                rows={1}
                value={input}
                disabled={!canChat(snapshot)}
                placeholder={
                  canChat(snapshot)
                    ? "Scrivi qui."
                    : isBusy(snapshot)
                      ? "Un momento, sto accendendo il modello…"
                      : active
                        ? "Accendi il modello per scrivere."
                        : "Scegli un modello per scrivere."
                }
                onChange={(event) => {
                  setInput(event.target.value);
                  resize();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
              />
              {snapshot?.phase === "inRisposta" ? (
                <Button variant="primary" onClick={() => void runtime.stop()}>
                  <IconStop size={14} />
                  Stop
                </Button>
              ) : (
                <Button variant="primary" type="submit" disabled={!canChat(snapshot) || !input.trim()}>
                  <IconSend size={14} />
                  Invia
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
