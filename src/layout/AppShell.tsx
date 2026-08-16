import { useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { ChatProvider, useChats } from "../hooks/useChats";
import { DownloadProvider } from "../hooks/useDownloads";
import { HardwareProvider } from "../hooks/useHardwareProfile";
import { LibraryProvider, useLibrarySnapshot } from "../hooks/useLibrary";
import { RuntimeProvider } from "../hooks/useRuntime";
import type { RouteId } from "../navigation/routes";
import { ChatView } from "../views/ChatView";
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

  async function openNewChat() {
    const active = library.items.find(
      (item) => item.variantId === library.active?.variantId && item.active,
    );
    if (!chats.current || chats.current.messages.length > 0) {
      await chats.create(
        active
          ? {
              modelId: active.modelId,
              modelName: active.modelName,
              variantId: active.variantId,
            }
          : undefined,
      );
    }
    setRoute("chat");
  }

  return (
    <div className="shell">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        onNewChat={() => void openNewChat()}
      />
      <main className="stage">
        <div className="stage-page" key={route}>
          {route === "machine" && <MachineView onNavigate={setRoute} />}
          {route === "models" && <ModelsView onNavigate={setRoute} />}
          {route === "chat" && <ChatView onNavigate={setRoute} />}
          {route === "downloads" && <DownloadsView onNavigate={setRoute} />}
          {route === "settings" && <SettingsView onNavigate={setRoute} />}
        </div>
      </main>
    </div>
  );
}
