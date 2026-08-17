import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { ChatProvider, useChats } from "../hooks/useChats";
import { DownloadProvider } from "../hooks/useDownloads";
import { HardwareProvider } from "../hooks/useHardwareProfile";
import { LibraryProvider, useLibrary, useLibrarySnapshot } from "../hooks/useLibrary";
import { RuntimeProvider, useRuntime } from "../hooks/useRuntime";
import { useSettings } from "../hooks/useSettings";
import { sessionsOfKind } from "../lib/chatGroups";
import { sessionKind } from "../lib/chat";
import { pickFolder } from "../lib/pickFolder";
import type { RouteId } from "../navigation/routes";
import { ChatView } from "../views/ChatView";
import { CodeView } from "../views/CodeView";
import { DownloadsView } from "../views/DownloadsView";
import { MachineView } from "../views/MachineView";
import { ModelsView } from "../views/ModelsView";
import { SettingsView } from "../views/SettingsView";
import { FeedbackBridge } from "./FeedbackBridge";
import { RuntimeBanner } from "./RuntimeBanner";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <DownloadProvider>
      <LibraryProvider>
        <RuntimeProvider>
          <ChatProvider>
            <HardwareProvider>
              <FeedbackBridge />
              <CatalogBoot />
              <RuntimeBoot />
              <AppFrame />
            </HardwareProvider>
          </ChatProvider>
        </RuntimeProvider>
      </LibraryProvider>
    </DownloadProvider>
  );
}

function CatalogBoot() {
  useCatalog();
  return null;
}

function RuntimeBoot() {
  const library = useLibrary();
  const runtime = useRuntime();
  const { settings } = useSettings();
  const snapshot = runtime.snapshot;
  const failed = useRef<string | null>(null);

  useEffect(() => {
    const lib = library.snapshot;
    if (!lib) return;

    const active = lib.items.find(
      (item) =>
        item.variantId === lib.active?.variantId && item.active && item.status === "pronto",
    );
    const phase = snapshot?.phase;
    if (!active) {
      if (phase === "pronto" || phase === "motore" || phase === "avvio" || phase === "inRisposta") {
        void runtime.unload();
      }
      return;
    }

    if (phase === "motore" || phase === "avvio" || phase === "inRisposta") {
      return;
    }

    const profile = settings?.profile;
    const sameModel = snapshot?.variantId === active.variantId;
    const sameProfile = !profile || !snapshot?.profile || snapshot.profile === profile;
    const key = `${active.variantId}:${profile ?? ""}`;

    if (phase === "pronto" && sameModel && sameProfile) {
      failed.current = null;
      return;
    }
    if (phase === "errore") {
      const failedKey = `${snapshot?.variantId ?? ""}:${snapshot?.profile ?? profile ?? ""}`;
      failed.current = failedKey;
      if (failedKey === key) {
        return;
      }
    }

    void runtime.load().catch(() => {
      failed.current = key;
    });
  }, [
    library.snapshot,
    snapshot?.phase,
    snapshot?.variantId,
    snapshot?.profile,
    settings?.profile,
    runtime.load,
    runtime.unload,
  ]);

  return null;
}

function AppFrame() {
  const [route, setRoute] = useState<RouteId>("machine");
  const chats = useChats();
  const library = useLibrarySnapshot();
  const active = library.items.find(
    (item) => item.variantId === library.active?.variantId && item.active,
  );
  const model = active
    ? {
        modelId: active.modelId,
        modelName: active.modelName,
        variantId: active.variantId,
      }
    : undefined;

  async function openNewChat() {
    const current = chats.current;
    const reuse =
      current &&
      sessionKind(current) === "chat" &&
      current.messages.length === 0;
    if (!reuse) {
      await chats.create(model);
    }
    setRoute("chat");
  }

  async function openCode() {
    if (sessionKind(chats.current) !== "code") {
      const last = sessionsOfKind(chats.snapshot?.sessions ?? [], "code").find(
        (item) => !item.archived,
      );
      if (last) await chats.open(last.id);
    }
    setRoute("code");
  }

  async function openNewCode() {
    setRoute("code");
    const path = await pickFolder("Apri una cartella del progetto");
    if (!path) return;
    await chats.create({
      ...model,
      kind: "code",
      workspacePath: path,
    });
  }

  return (
    <div className="shell">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        onNewChat={() => void openNewChat()}
        onOpenCode={() => void openCode()}
        onNewCode={() => void openNewCode()}
      />
      <main className="stage">
        <RuntimeBanner />
        <div className="stage-page" key={route}>
          {route === "machine" && <MachineView onNavigate={setRoute} />}
          {route === "models" && <ModelsView onNavigate={setRoute} />}
          {route === "chat" && <ChatView onNavigate={setRoute} />}
          {route === "code" && <CodeView onNavigate={setRoute} />}
          {route === "downloads" && <DownloadsView onNavigate={setRoute} />}
          {route === "settings" && <SettingsView onNavigate={setRoute} />}
        </div>
      </main>
    </div>
  );
}
