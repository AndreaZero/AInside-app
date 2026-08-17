import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useChats } from "../hooks/useChats";
import { useLibrary, useLibrarySnapshot } from "../hooks/useLibrary";
import { useRuntime } from "../hooks/useRuntime";
import { useSettings } from "../hooks/useSettings";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { useTokenRate } from "../hooks/useTokenRate";
import { sessionKind, type ChatMessage } from "../lib/chat";
import { formatDuration, formatProgress, formatTokenRate } from "../lib/format";
import { canChat, composerPlaceholder } from "../lib/runtime";
import { visibleAnswer } from "../lib/think";
import { webPreviewDoc } from "../lib/webPreview";
import type { RouteId } from "../navigation/routes";
import { Button, StatusBadge } from "../ui/controls";
import { IconSend, IconStop } from "../ui/icons";
import { MenuItem, Popover, useFeedback } from "../ui/overlays";
import { RuntimeLoadLog } from "../layout/RuntimeBanner";
import { EmptyState, ErrorState, InlineAlert } from "../ui/states";
import { EmptyGlyph } from "../visuals/DownloadRig";
import { ModelLogo } from "../visuals/ModelLogo";
import { AssistantMessage, UserBubble } from "./chat/ChatMessage";
import { ComposerThinkTools } from "./chat/ComposerThinkTools";
import { PreviewHost, PreviewToggle } from "./chat/PreviewPane";

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
  const catalog = useCatalog();
  const active = library.items.find(
    (item) => item.variantId === library.active?.variantId && item.active,
  );
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const pendingReply = useRef(false);
  const genStarted = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const snapshot = runtime.snapshot;
  const session = sessionKind(chats.current) === "code" ? null : chats.current;
  const currentId = session?.id ?? null;
  const model = useMemo(
    () =>
      active
        ? { modelId: active.modelId, modelName: active.modelName, variantId: active.variantId }
        : undefined,
    [active?.modelId, active?.modelName, active?.variantId],
  );
  const tokenRate = useTokenRate(runtime.reply, snapshot?.phase === "inRisposta");
  const log = useStickToBottom(
    `${currentId}:${turns.length}:${runtime.reply.length}:${snapshot?.phase ?? ""}`,
  );

  useEffect(() => {
    if (pendingReply.current) return;
    const stored = chats.snapshot?.sessions.find((item) => item.id === currentId);
    setTurns(stored?.messages ?? []);
    runtime.clearReply();
  }, [currentId, chats.snapshot, runtime.clearReply]);

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
    if (area.current) area.current.style.height = "32px";
    log.pin();
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
    log.pin();
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
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  if (!active && turns.length === 0 && !session) {
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

  const title = session?.title ?? snapshot?.modelName ?? active?.modelName ?? "Chat";
  const downloading = snapshot?.phase === "motore" && snapshot.expectedBytes > 0;
  const lastAssistant = turns.length > 0 && turns[turns.length - 1]?.role === "assistant";
  let lastAssistantText = "";
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "assistant") {
      lastAssistantText = turns[i].content;
      break;
    }
  }
  const streamingDoc = runtime.reply ? webPreviewDoc(visibleAnswer(runtime.reply)) : null;
  const storedDoc = lastAssistantText
    ? webPreviewDoc(visibleAnswer(lastAssistantText))
    : null;
  const previewDoc = streamingDoc ?? storedDoc;
  const previewLive = Boolean(streamingDoc && snapshot?.phase === "inRisposta");
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
        <PreviewHost doc={previewDoc} live={previewLive} resetKey={currentId}>
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
                  <>
                    {readyModels.length === 0 ? (
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
                    )}
                    {currentId ? (
                      <MenuItem
                        danger
                        onSelect={() => {
                          setModelOpen(false);
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
                    ) : null}
                  </>
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
            </div>
            <PreviewToggle />
          </header>

          {(runtime.error || snapshot?.phase === "errore") && (
            <div style={{ padding: "12px 22px 0" }}>
              <ErrorState
                title="Il modello non è partito"
                description={runtime.error ?? snapshot?.message ?? "Qualcosa è andato storto."}
                detail={snapshot?.errorDetail}
                action={
                  active ? (
                    <Button onClick={() => void runtime.load()}>Riprova</Button>
                  ) : (
                    <Button onClick={() => onNavigate("models")}>Scegli un modello</Button>
                  )
                }
              />
            </div>
          )}
          {chats.error && (
            <div style={{ padding: "12px 22px 0" }}>
              <InlineAlert tone="danger">{chats.error}</InlineAlert>
            </div>
          )}

          <div className="chat-log" aria-live="polite" ref={log.ref} onScroll={log.onScroll}>
            {turns.length === 0 && !runtime.reply && snapshot?.phase !== "inRisposta" && (
              <p className="page-note">
                {snapshot?.phase === "motore" || snapshot?.phase === "avvio"
                  ? snapshot.message
                  : snapshot?.outcome ??
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
            {(snapshot?.phase === "avvio" ||
              snapshot?.phase === "motore" ||
              snapshot?.phase === "errore") && (
              <div className="chat-status-line chat-status-line--stack">
                <span>{snapshot.message}</span>
                <RuntimeLoadLog snapshot={snapshot} />
              </div>
            )}
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void onSend();
              }}
            >
              <div className="chat-composer-field">
                <textarea
                  ref={area}
                  rows={1}
                  value={input}
                  disabled={!canChat(snapshot)}
                  placeholder={composerPlaceholder(snapshot, Boolean(active), "Scrivi qui.")}
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
              </div>
              <ComposerThinkTools
                thinkingOn={thinkingOn}
                showThinking={showThinking}
                onToggleThinking={() => void changeThinking(!thinkingOn)}
                onToggleShow={toggleShowThinking}
              />
            </form>
          </div>
        </div>
        </PreviewHost>
      </div>
    </section>
  );
}
