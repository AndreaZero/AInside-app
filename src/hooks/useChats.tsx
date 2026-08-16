import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  archiveChat,
  createChat,
  deleteChat,
  listChats,
  openChat,
  saveChatMessages,
} from "../lib/backend";
import {
  currentSession,
  type ChatMessage,
  type ChatSession,
  type ChatSnapshot,
} from "../lib/chat";

type ChatApi = {
  snapshot: ChatSnapshot | null;
  current: ChatSession | null;
  error: string | null;
  create: (model?: {
    modelId?: string | null;
    modelName?: string | null;
    variantId?: string | null;
  }) => Promise<void>;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  archive: (id: string, archived?: boolean) => Promise<void>;
  save: (
    messages: ChatMessage[],
    model?: {
      modelId?: string | null;
      modelName?: string | null;
      variantId?: string | null;
    },
  ) => Promise<void>;
};

const ChatContext = createContext<ChatApi | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listChats()
      .then((current) => {
        setSnapshot(current);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Chat non disponibili.");
      });
  }, []);

  const create = useCallback(
    async (model?: {
      modelId?: string | null;
      modelName?: string | null;
      variantId?: string | null;
    }) => {
      try {
        setSnapshot(await createChat(model));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Non apro una chat nuova.");
      }
    },
    [],
  );

  const open = useCallback(async (id: string) => {
    try {
      setSnapshot(await openChat(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non apro questa chat.");
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      setSnapshot(await deleteChat(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non tolgo la chat.");
    }
  }, []);

  const archive = useCallback(async (id: string, archived = true) => {
    try {
      setSnapshot(await archiveChat(id, archived));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non archivio la chat.");
    }
  }, []);

  const save = useCallback(
    async (
      messages: ChatMessage[],
      model?: {
        modelId?: string | null;
        modelName?: string | null;
        variantId?: string | null;
      },
    ) => {
      try {
        setSnapshot(await saveChatMessages(snapshot?.currentId ?? null, messages, model));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Non salvo la chat.");
      }
    },
    [snapshot?.currentId],
  );

  const value = useMemo<ChatApi>(
    () => ({
      snapshot,
      current: currentSession(snapshot),
      error,
      create,
      open,
      remove,
      archive,
      save,
    }),
    [snapshot, error, create, open, remove, archive, save],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChats(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChats richiede ChatProvider");
  }
  return ctx;
}
