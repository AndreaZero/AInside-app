import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useChats } from "../hooks/useChats";
import { useLibrary, useLibrarySnapshot } from "../hooks/useLibrary";
import { useRuntime } from "../hooks/useRuntime";
import { useSettings } from "../hooks/useSettings";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { useTokenRate } from "../hooks/useTokenRate";
import { folderName, sessionKind, type ChatMessage } from "../lib/chat";
import { cx } from "../lib/cx";
import { formatDuration, formatTokenRate } from "../lib/format";
import { pickFolder } from "../lib/pickFolder";
import { canChat, composerPlaceholder } from "../lib/runtime";
import { visibleAnswer, splitThink } from "../lib/think";
import { webPreviewDoc } from "../lib/webPreview";
import {
  flattenFiles,
  fileLabel,
  mentionAt,
  stripEditBlocks,
  workspaceApply,
  workspacePreview,
  workspaceRead,
  workspaceSearch,
  workspaceTree,
  workspaceUndo,
  type CodePatch,
  type WorkspaceFile,
  type WorkspaceHit,
  type WorkspaceTree,
} from "../lib/workspace";
import { codingGrant, codingRevoke, codingStatus } from "../lib/backend";
import type { CodingStatus } from "../lib/settings";
import type { RouteId } from "../navigation/routes";
import { Button, StatusBadge } from "../ui/controls";
import { IconFolder, IconSend, IconStop } from "../ui/icons";
import { MenuItem, Popover, Tooltip, useFeedback } from "../ui/overlays";
import { EmptyState, ErrorState, InlineAlert } from "../ui/states";
import { RuntimeLoadLog } from "../layout/RuntimeBanner";
import { ModelLogo } from "../visuals/ModelLogo";
import { AssistantMessage, UserBubble } from "./chat/ChatMessage";
import { ComposerThinkTools } from "./chat/ComposerThinkTools";
import { PreviewHost, PreviewToggle } from "./chat/PreviewPane";
import { CodeMentions } from "./code/CodeMentions";
import { CodePatchCard } from "./code/CodePatchCard";
import { CodePreview } from "./code/CodePreview";
import { CodeTree } from "./code/CodeTree";

type CodeViewProps = {
  onNavigate: (route: RouteId) => void;
};

export function CodeView({ onNavigate }: CodeViewProps) {
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
  const session = sessionKind(chats.current) === "code" ? chats.current : null;
  const workspace = session?.workspacePath ?? null;
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [writeStatus, setWriteStatus] = useState<CodingStatus | null>(null);
  const pendingReply = useRef(false);
  const genStarted = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [tree, setTree] = useState<WorkspaceTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkspaceFile | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<WorkspaceHit[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionTimer = useRef<number | null>(null);
  const recents = useRef<string[]>([]);
  const turnsRef = useRef<ChatMessage[]>([]);
  const workspaceRef = useRef<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  turnsRef.current = turns;
  workspaceRef.current = workspace;
  const snapshot = runtime.snapshot;
  const currentId = session?.id ?? null;
  const model = useMemo(
    () =>
      active
        ? { modelId: active.modelId, modelName: active.modelName, variantId: active.variantId }
        : undefined,
    [active?.modelId, active?.modelName, active?.variantId],
  );
  const tokenRate = useTokenRate(runtime.reply, snapshot?.phase === "inRisposta");
  const log = useStickToBottom();
  const catalogModel =
    catalog.status === "ready" && active
      ? catalog.catalog.models.find((item) => item.id === active.modelId)
      : undefined;
  const codingScore = catalogModel?.quality.coding ?? 0;
  const betterInstalled =
    catalog.status === "ready"
      ? library.items.find((item) => {
          if (item.status !== "pronto" || item.modelId === active?.modelId) return false;
          const entry = catalog.catalog.models.find((model) => model.id === item.modelId);
          return (entry?.quality.coding ?? 0) >= 4;
        })
      : undefined;
  const weakCoding = Boolean(active && catalogModel && codingScore < 4);

  useEffect(() => {
    if (pendingReply.current) return;
    setTurns(session?.messages ?? []);
    runtime.clearReply();
  }, [currentId, session?.messages, runtime.clearReply]);

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
        runtime.clearReply();
        void settleReply(reply, durationMs);
      } else {
        runtime.clearReply();
      }
    }
  }, [snapshot?.phase, runtime.reply, runtime.clearReply]);

  useEffect(() => {
    if (!workspace) {
      setTree(null);
      setPreview(null);
      setWriteStatus(null);
      recents.current = [];
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    setPreview(null);
    setPreviewError(null);
    void workspaceTree(workspace)
      .then((next) => {
        if (!cancelled) {
          setTree(next);
          setTreeLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTreeError(err instanceof Error ? err.message : "Non leggo la cartella.");
          setTreeLoading(false);
        }
      });
    void codingStatus(workspace)
      .then((next) => {
        if (!cancelled) setWriteStatus(next);
      })
      .catch(() => {
        if (!cancelled) setWriteStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  async function persist(next: ChatMessage[]) {
    setTurns(next);
    await chats.save(next, model);
  }

  async function refreshTree() {
    const root = workspaceRef.current;
    if (!root) return;
    try {
      setTree(await workspaceTree(root));
      setTreeError(null);
    } catch (err: unknown) {
      setTreeError(err instanceof Error ? err.message : "Non leggo la cartella.");
    }
  }

  async function refreshWriteStatus() {
    const root = workspaceRef.current;
    if (!root) return;
    try {
      setWriteStatus(await codingStatus(root));
    } catch {
      setWriteStatus(null);
    }
  }

  function mergePatches(current: CodePatch[], updates: CodePatch[]): CodePatch[] {
    return current.map((patch) => updates.find((item) => item.rel === patch.rel) ?? patch);
  }

  function displayContent(text: string, patches?: CodePatch[] | null): string {
    if (!patches?.length) return text;
    const split = splitThink(text);
    const stripped = stripEditBlocks(visibleAnswer(text));
    if (split.thinking) {
      return `<think>${split.thinking}</think>\n${stripped}`;
    }
    return stripped;
  }

  async function settleReply(reply: string, durationMs?: number) {
    const root = workspaceRef.current;
    let patches: CodePatch[] | undefined;
    if (root) {
      try {
        const files = await workspacePreview(root, reply);
        if (files.length) patches = files;
      } catch {
        patches = undefined;
      }
    }
    const next: ChatMessage[] = [
      ...turnsRef.current,
      { role: "assistant", content: reply, durationMs, patches },
    ];
    await persist(next);
    if (patches?.some((item) => item.status === "pending")) {
      await offerWrite(next.length - 1, reply, patches);
    }
  }

  async function offerWrite(
    index: number,
    text: string,
    patches: CodePatch[],
    only?: string[],
  ) {
    const ready = patches.filter(
      (item) =>
        item.status === "pending" && (!only || only.includes(item.rel)),
    );
    if (!ready.length) return;
    const secrets = ready.some((item) => item.secret);
    if (secrets) {
      const ok = await feedback.confirm({
        title: "File riservato",
        description: "C’è un file tipo .env o una chiave. Vuoi scriverlo comunque?",
        confirmLabel: "Scrivi",
        danger: true,
      });
      if (!ok) return;
      await applyAt(
        index,
        text,
        ready.map((item) => item.rel),
        writeStatus?.canWrite ? null : "once",
        true,
      );
      return;
    }
    let grant: "once" | "session" | "folder" | null = writeStatus?.canWrite ? null : "once";
    if (!writeStatus?.canWrite) {
      const choice = await feedback.choose({
        title:
          ready.length === 1
            ? `Il modello vuole modificare ${fileLabel(ready[0].rel)}.`
            : `Il modello vuole modificare ${ready.length} file in ${rootName}.`,
        description: "Puoi accettare solo stavolta, o per sempre in questa cartella.",
        actions: [
          { id: "once", label: "Solo questi, questa volta", variant: "primary" },
          { id: "folder", label: "Sempre in questa cartella" },
        ],
        cancelLabel: "Non ora",
      });
      if (!choice) return;
      grant = choice === "folder" ? "folder" : "once";
    }
    await applyAt(
      index,
      text,
      ready.map((item) => item.rel),
      grant,
      false,
    );
  }

  async function applyAt(
    index: number,
    text: string,
    rels: string[],
    grant: "once" | "session" | "folder" | null,
    allowSecrets: boolean,
  ) {
    const root = workspaceRef.current;
    if (!root) return;
    try {
      const result = await workspaceApply({
        root,
        text,
        rels,
        grant,
        allowSecrets,
      });
      const next = turnsRef.current.map((turn, i) => {
        if (i !== index || !turn.patches) return turn;
        return { ...turn, patches: mergePatches(turn.patches, result.files) };
      });
      await persist(next);
      await refreshTree();
      await refreshWriteStatus();
      if (result.wrote.length) {
        const title =
          result.wrote.length === 1
            ? `Ho scritto ${fileLabel(result.wrote[0])}`
            : `Ho scritto ${result.wrote.length} file`;
        feedback.success(title, undefined, {
          label: "Annulla",
          onClick: () => {
            void undoWrites(index, result.wrote);
          },
        });
      }
    } catch (err: unknown) {
      feedback.error(err instanceof Error ? err.message : "Non scrivo i file.");
    }
  }

  async function undoWrites(index: number, rels?: string[]) {
    const root = workspaceRef.current;
    if (!root) return;
    try {
      const restored = await workspaceUndo(root);
      const marks = rels ?? restored;
      const next = turnsRef.current.map((turn, i) => {
        if (i !== index || !turn.patches) return turn;
        return {
          ...turn,
          patches: turn.patches.map((patch) =>
            patch.status === "applied" && marks.includes(patch.rel)
              ? { ...patch, status: "pending" }
              : patch,
          ),
        };
      });
      await persist(next);
      await refreshTree();
      await refreshWriteStatus();
      feedback.info("Ho annullato l’ultima scrittura.");
    } catch (err: unknown) {
      feedback.error(err instanceof Error ? err.message : "Non annullo.");
    }
  }

  function rememberFile(rel: string) {
    recents.current = [rel, ...recents.current.filter((old) => old !== rel)].slice(0, 8);
  }

  function citedFiles(): string[] {
    const cited: string[] = [];
    if (preview?.rel) cited.push(preview.rel);
    for (const rel of recents.current) {
      if (!cited.includes(rel)) cited.push(rel);
    }
    return cited;
  }

  async function runCoding(next: ChatMessage[]) {
    if (!workspace) return;
    const cited = citedFiles();
    setMentions([]);
    setPreview(null);
    setPreviewError(null);
    await runtime.sendCoding({
      messages: next.map((turn) => ({ role: turn.role, content: turn.content })),
      workspace,
      cited,
    });
  }

  async function onSend() {
    const text = input.trim();
    if (!text || !workspace || !canChat(snapshot)) return;
    setInput("");
    if (area.current) area.current.style.height = "32px";
    log.pin();
    genStarted.current = Date.now();
    setElapsedMs(0);
    const next: ChatMessage[] = [...turns, { role: "user", content: text }];
    pendingReply.current = true;
    await persist(next);
    await runCoding(next).catch(() => {
      pendingReply.current = false;
    });
  }

  async function onRegenerate() {
    if (!workspace || !canChat(snapshot) || snapshot?.phase === "inRisposta") return;
    const last = turns[turns.length - 1];
    if (last?.role !== "assistant") return;
    const next = turns.slice(0, -1);
    log.pin();
    genStarted.current = Date.now();
    setElapsedMs(0);
    pendingReply.current = true;
    runtime.clearReply();
    await persist(next);
    await runCoding(next).catch(() => {
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

  function refreshMentions(text: string, caret: number) {
    const mention = mentionAt(text, caret);
    if (!mention || !workspace) {
      setMentions([]);
      return;
    }
    if (mentionTimer.current != null) {
      window.clearTimeout(mentionTimer.current);
    }
    mentionTimer.current = window.setTimeout(() => {
      void loadMentions(mention.query);
    }, 80);
  }

  async function loadMentions(query: string) {
    if (!workspace) return;
    if (!query.trim()) {
      setMentions(
        flattenFiles(tree?.nodes ?? [])
          .slice(0, 16)
          .map((rel) => ({ rel, kind: "path" })),
      );
      setMentionIndex(0);
      return;
    }
    try {
      const hits = await workspaceSearch(workspace, query);
      setMentions(hits.slice(0, 12));
      setMentionIndex(0);
    } catch {
      setMentions([]);
    }
  }

  function pickMention(rel: string) {
    const caret = area.current?.selectionStart ?? input.length;
    const mention = mentionAt(input, caret);
    if (!mention) return;
    const next = `${input.slice(0, mention.start)}@${rel} ${input.slice(caret)}`;
    setInput(next);
    setMentions([]);
    window.setTimeout(() => {
      area.current?.focus();
      const pos = mention.start + rel.length + 2;
      area.current?.setSelectionRange(pos, pos);
      resize();
    }, 0);
  }

  async function openFile(rel: string) {
    if (!workspace) return;
    setPreviewError(null);
    try {
      setPreview(await workspaceRead(workspace, rel));
      rememberFile(rel);
    } catch (err: unknown) {
      setPreview({ rel, text: "", truncated: false });
      setPreviewError(err instanceof Error ? err.message : "Non apro questo file.");
    }
  }

  async function chooseFolder() {
    const path = await pickFolder("Apri una cartella del progetto");
    if (!path) return;
    if (session) {
      await chats.setWorkspace(session.id, path);
      return;
    }
    await chats.create({
      ...model,
      kind: "code",
      workspacePath: path,
    });
  }

  const lastAssistant = turns.length > 0 && turns[turns.length - 1]?.role === "assistant";
  let lastAssistantText = "";
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "assistant") {
      lastAssistantText = turns[i].content;
      break;
    }
  }
  const streamingDoc = runtime.reply
    ? webPreviewDoc(visibleAnswer(stripEditBlocks(runtime.reply)))
    : null;
  const storedDoc = lastAssistantText
    ? webPreviewDoc(visibleAnswer(stripEditBlocks(lastAssistantText)))
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
  const rootName = workspace ? folderName(workspace) : "Codice";
  const lastWorkspace = settings?.coding?.lastWorkspace ?? null;

  async function reopenLast() {
    if (!lastWorkspace) return;
    if (session) {
      await chats.setWorkspace(session.id, lastWorkspace);
      return;
    }
    await chats.create({
      ...model,
      kind: "code",
      workspacePath: lastWorkspace,
    });
  }

  async function askAgain() {
    setPermOpen(false);
    const root = workspaceRef.current;
    if (!root) return;
    try {
      if (writeStatus?.write === "always") {
        const ok = await feedback.confirm({
          title: "Tornare a chiedere?",
          description: "Prima di scrivere, AInside chiederà di nuovo in ogni cartella.",
          confirmLabel: "Chiedi",
        });
        if (!ok) return;
        await codingGrant("ask");
      }
      setWriteStatus(await codingRevoke(root));
    } catch (err: unknown) {
      feedback.error(err instanceof Error ? err.message : "Non cambio il permesso.");
    }
  }

  if (!workspace) {
    return (
      <section className="page page--fill chat-empty">
        {chats.error ? (
          <div style={{ padding: "0 0 20px" }}>
            <InlineAlert tone="danger">{chats.error}</InlineAlert>
          </div>
        ) : null}
        <EmptyState
          visual={<IconFolder size={36} />}
          title="Apri una cartella"
          description="Il modello legge i file. Per modificarli ti chiede il permesso — puoi darglielo anche per sempre, su questa cartella."
          action={
            <div className="empty-actions">
              <Button variant="primary" onClick={() => void chooseFolder()}>
                <IconFolder size={14} />
                Apri cartella
              </Button>
              {lastWorkspace ? (
                <Button onClick={() => void reopenLast()}>
                  Riapri {folderName(lastWorkspace)}
                </Button>
              ) : null}
            </div>
          }
        />
      </section>
    );
  }

  return (
    <section className="page page--fill">
      <div className="code-shell">
        <CodeTree
          root={workspace}
          rootName={rootName}
          nodes={tree?.nodes ?? []}
          truncated={Boolean(tree?.truncated)}
          loading={treeLoading}
          error={treeError}
          selected={preview?.rel ?? null}
          onSelect={(rel) => void openFile(rel)}
        />
        <PreviewHost doc={previewDoc} live={previewLive} resetKey={session?.id}>
        <div className="chat-main">
          <header className="chat-head">
            <div className="chat-head-meta">
              <ModelLogo
                seed={active?.modelId ?? "code"}
                source={
                  catalogModel ?? {
                    id: active?.modelId,
                    name: active?.modelName,
                  }
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
                              title: "Togliere questo lavoro?",
                              description:
                                "La conversazione sparisce da AInside. I file del progetto restano sul disco.",
                              confirmLabel: "Togli",
                              danger: true,
                            })
                            .then((ok) => {
                              if (ok) void chats.remove(currentId);
                            });
                        }}
                      >
                        Togli questo lavoro
                      </MenuItem>
                    ) : null}
                  </>
                }
              >
                <Button variant="ghost" onClick={() => setModelOpen((v) => !v)}>
                  {active?.modelName ?? "Modello"}
                </Button>
              </Popover>
              <StatusBadge
                kind={
                  localeKind === "locale"
                    ? "locale"
                    : localeKind === "error"
                      ? "error"
                      : localeKind === "run"
                        ? "run"
                        : "paused"
                }
              >
                {snapshot?.phase === "pronto" || snapshot?.phase === "inRisposta"
                  ? "Locale"
                  : snapshot?.phaseLabel ?? "Locale"}
              </StatusBadge>
              <Tooltip label={`${workspace} · clicca per cambiare`}>
                <button
                  type="button"
                  className="code-folder-chip"
                  onClick={() => void chooseFolder()}
                >
                  {rootName}
                </button>
              </Tooltip>
              <Popover
                open={permOpen}
                onClose={() => setPermOpen(false)}
                content={
                  writeStatus?.canWrite ? (
                    <MenuItem onSelect={() => void askAgain()}>Chiedi prima di scrivere</MenuItem>
                  ) : (
                    <MenuItem onSelect={() => setPermOpen(false)}>
                      Chiede il permesso prima di scrivere
                    </MenuItem>
                  )
                }
              >
                <button
                  type="button"
                  className={cx("code-perm-chip", writeStatus?.canWrite && "is-ok")}
                  onClick={() => setPermOpen((value) => !value)}
                >
                  {writeStatus?.label ?? "Chiede"}
                </button>
              </Popover>
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
          {weakCoding && (
            <div style={{ padding: "12px 22px 0" }}>
              <InlineAlert>
                {betterInstalled
                  ? `Per il codice va meglio ${betterInstalled.modelName}. Usarlo?`
                  : "Questo modello è debole sul codice. In Modelli scegline uno con il tag Codice."}
                {betterInstalled ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="code-inline-action"
                      onClick={() =>
                        void libraryApi.useModel(
                          betterInstalled.modelId,
                          betterInstalled.variantId,
                        )
                      }
                    >
                      Usa {betterInstalled.modelName}
                    </button>
                  </>
                ) : (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="code-inline-action"
                      onClick={() => onNavigate("models")}
                    >
                      Vai ai modelli
                    </button>
                  </>
                )}
              </InlineAlert>
            </div>
          )}

          <div
            className={cx("chat-log", (preview || previewError) && "is-preview")}
            aria-live="polite"
            ref={log.ref}
            onScroll={log.onScroll}
          >
            <div className="chat-log-inner" ref={log.innerRef}>
            {preview || previewError ? (
              <CodePreview
                file={preview}
                error={previewError}
                onClose={() => {
                  setPreview(null);
                  setPreviewError(null);
                }}
              />
            ) : (
              <>
            {turns.length === 0 && !runtime.reply && snapshot?.phase !== "inRisposta" && (
              <p className="page-note">
                Apri un file a sinistra, oppure scrivi @ per citarlo.
              </p>
            )}
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <UserBubble key={`${currentId}-${index}`} text={turn.content} />
              ) : (
                <div key={`${currentId}-${index}`}>
                  <AssistantMessage
                    text={displayContent(turn.content, turn.patches)}
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
                  {turn.patches?.length ? (
                    <div className="code-patch-list">
                      {turn.patches.map((patch) => (
                        <CodePatchCard
                          key={patch.rel}
                          patch={patch}
                          onApply={
                            patch.status === "pending"
                              ? () =>
                                  void offerWrite(index, turn.content, turn.patches ?? [], [
                                    patch.rel,
                                  ])
                              : undefined
                          }
                          onUndo={
                            patch.status === "applied" && writeStatus?.canUndo
                              ? () => void undoWrites(index, [patch.rel])
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
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
              </>
            )}
            </div>
          </div>

          <div className="chat-composer-wrap code-composer">
            {snapshot?.phase === "inRisposta" && (
              <div className="chat-status-line">
                <span>
                  {/Leggo `/.test(runtime.reply)
                    ? "Sto leggendo un file…"
                    : /Scrivo `/.test(runtime.reply)
                      ? "Sto scrivendo un file…"
                      : thinkingOn
                      ? "Ragionamento acceso · generazione…"
                      : "Generazione in corso…"}
                </span>
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
            {mentions.length > 0 ? (
              <CodeMentions
                hits={mentions}
                active={mentionIndex}
                onPick={pickMention}
              />
            ) : null}
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
                  placeholder={composerPlaceholder(
                    snapshot,
                    Boolean(active),
                    "Cosa vuoi fare? @ per un file.",
                  )}
                  onChange={(event) => {
                    setInput(event.target.value);
                    resize();
                    refreshMentions(event.target.value, event.target.selectionStart ?? 0);
                  }}
                  onKeyDown={(event) => {
                    if (mentions.length > 0) {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMentionIndex((index) => (index + 1) % mentions.length);
                        return;
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setMentionIndex((index) => (index - 1 + mentions.length) % mentions.length);
                        return;
                      }
                      if (event.key === "Enter" || event.key === "Tab") {
                        event.preventDefault();
                        pickMention(mentions[mentionIndex]?.rel ?? mentions[0].rel);
                        return;
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setMentions([]);
                        return;
                      }
                    }
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
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!canChat(snapshot) || !input.trim()}
                  >
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
