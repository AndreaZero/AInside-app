import { useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { ChatProvider, useChats } from "../hooks/useChats";
import { DownloadProvider } from "../hooks/useDownloads";
import { HardwareProvider } from "../hooks/useHardwareProfile";
import { LibraryProvider, useLibrarySnapshot } from "../hooks/useLibrary";
import { RuntimeProvider } from "../hooks/useRuntime";
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
