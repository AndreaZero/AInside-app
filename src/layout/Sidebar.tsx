import { Mark } from "../assets/Mark";
import { useChats } from "../hooks/useChats";
import { archivedSessions, groupSessions } from "../lib/chatGroups";
import { cx } from "../lib/cx";
import type { ChatSession } from "../lib/chat";
import { MENU_ROUTES, ROUTE_LABEL, type RouteId } from "../navigation/routes";
import {
  IconArchive,
  IconDownload,
  IconHome,
  IconModels,
  IconPlus,
  IconSettings,
  IconTrash,
} from "../ui/icons";
import { Tooltip, useFeedback } from "../ui/overlays";
import { DownloadDock } from "./DownloadDock";
import { SystemWidget } from "./SystemWidget";

const PAGE_ICON = {
  machine: IconHome,
  models: IconModels,
  downloads: IconDownload,
  settings: IconSettings,
} as const;

type SidebarProps = {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  onNewChat: () => void;
};

export function Sidebar({ route, onNavigate, onNewChat }: SidebarProps) {
  const chats = useChats();
  const sessions = chats.snapshot?.sessions ?? [];
  const groups = groupSessions(sessions);
  const archived = archivedSessions(sessions);
  const currentId = chats.current?.id;

  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="rail-brand">
          <Mark size={18} />
          <span>AInside</span>
        </div>
        <nav className="rail-pages" aria-label="Pagine">
          {MENU_ROUTES.map((id) => {
            const Icon = PAGE_ICON[id];
            return (
              <Tooltip key={id} label={ROUTE_LABEL[id]}>
                <button
                  type="button"
                  className={cx("rail-page", route === id && "is-active")}
                  aria-label={ROUTE_LABEL[id]}
                  aria-current={route === id ? "page" : undefined}
                  onClick={() => onNavigate(id)}
                >
                  <Icon size={15} />
                </button>
              </Tooltip>
            );
          })}
        </nav>
      </div>

      <button type="button" className="rail-item is-new" onClick={onNewChat}>
        <IconPlus />
        <span>Nuova chat</span>
      </button>

      <nav className="rail-chats" aria-label="Conversazioni">
        {groups.length === 0 && archived.length === 0 ? (
          <p className="rail-empty">Le chat compariranno qui.</p>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.id} className="chat-group">
                <h2>{group.label}</h2>
                {group.items.map((session) => (
                  <ChatRow
                    key={session.id}
                    session={session}
                    active={session.id === currentId && route === "chat"}
                    onOpen={() => {
                      void chats.open(session.id).then(() => onNavigate("chat"));
                    }}
                    onArchive={() => void chats.archive(session.id, true)}
                    onRemove={() => void chats.remove(session.id)}
                  />
                ))}
              </div>
            ))}
            {archived.length > 0 && (
              <div className="chat-group">
                <h2>Archivio</h2>
                {archived.map((session) => (
                  <ChatRow
                    key={session.id}
                    session={session}
                    active={session.id === currentId && route === "chat"}
                    archived
                    onOpen={() => {
                      void chats.open(session.id).then(() => onNavigate("chat"));
                    }}
                    onArchive={() => void chats.archive(session.id, false)}
                    onRemove={() => void chats.remove(session.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="rail-split" role="separator" />

      <div className="rail-foot">
        <DownloadDock onOpen={() => onNavigate("downloads")} />
        <SystemWidget />
      </div>
    </aside>
  );
}

function ChatRow({
  session,
  active,
  archived,
  onOpen,
  onArchive,
  onRemove,
}: {
  session: ChatSession;
  active: boolean;
  archived?: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onRemove: () => void;
}) {
  const feedback = useFeedback();

  return (
    <div className={cx("rail-chat", active && "is-active")}>
      <button type="button" className={cx("rail-item", active && "is-active")} onClick={onOpen}>
        <span>{session.title}</span>
      </button>
      <div className="rail-chat-ops">
        <Tooltip label={archived ? "Togli dall’archivio" : "Archivia"}>
          <button
            type="button"
            className="rail-chat-op"
            aria-label={archived ? "Togli dall’archivio" : "Archivia"}
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
          >
            <IconArchive size={14} />
          </button>
        </Tooltip>
        <Tooltip label="Elimina">
          <button
            type="button"
            className="rail-chat-op is-danger"
            aria-label="Elimina"
            onClick={(event) => {
              event.stopPropagation();
              void feedback
                .confirm({
                  title: "Eliminare questa chat?",
                  description: "La conversazione sparisce da AInside. I modelli restano sul disco.",
                  confirmLabel: "Elimina",
                  danger: true,
                })
                .then((ok) => {
                  if (ok) onRemove();
                });
            }}
          >
            <IconTrash size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
