import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getRuntime,
  loadRuntime,
  startCodingTurn,
  startCompletion,
  stopCompletion,
  unloadRuntime,
} from "../lib/backend";
import type { ChatTurn, RuntimeSnapshot, TokenChunk } from "../lib/runtime";

type RuntimeApi = {
  snapshot: RuntimeSnapshot | null;
  reply: string;
  error: string | null;
  load: () => Promise<void>;
  unload: () => Promise<void>;
  send: (messages: ChatTurn[]) => Promise<void>;
  sendCoding: (input: {
    messages: ChatTurn[];
    workspace: string;
    cited?: string[];
  }) => Promise<void>;
  stop: () => Promise<void>;
  clearReply: () => void;
};

const RuntimeContext = createContext<RuntimeApi | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getRuntime()
      .then((current) => {
        if (alive) {
          setSnapshot(current);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Motore non disponibile.");
        }
      });

    const unlistenStatus = listen<RuntimeSnapshot>("runtime-update", (event) => {
      setSnapshot(event.payload);
    });
    const unlistenToken = listen<TokenChunk>("runtime-token", (event) => {
      if (event.payload.text) {
        setReply((current) => current + event.payload.text);
      }
    });

    return () => {
      alive = false;
      void unlistenStatus.then((stop) => stop());
      void unlistenToken.then((stop) => stop());
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      await loadRuntime();
      setSnapshot(await getRuntime());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Non carico il modello.";
      setError(message);
      try {
        setSnapshot(await getRuntime());
      } catch {
        /* lo snapshot resta quello degli eventi */
      }
      throw new Error(message);
    }
  }, []);

  const unload = useCallback(async () => {
    try {
      await unloadRuntime();
      setSnapshot(await getRuntime());
      setReply("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non fermo il modello.");
    }
  }, []);

  const send = useCallback(async (messages: ChatTurn[]) => {
    try {
      setReply("");
      setSnapshot(await startCompletion(messages));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Non parto la risposta.";
      setError(message);
      throw new Error(message);
    }
  }, []);

  const sendCoding = useCallback(
    async (input: { messages: ChatTurn[]; workspace: string; cited?: string[] }) => {
      try {
        setReply("");
        setSnapshot(await startCodingTurn(input));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Non parto la risposta.";
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    try {
      setSnapshot(await stopCompletion());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non fermo la risposta.");
    }
  }, []);

  const clearReply = useCallback(() => setReply(""), []);

  const value = useMemo<RuntimeApi>(
    () => ({ snapshot, reply, error, load, unload, send, sendCoding, stop, clearReply }),
    [snapshot, reply, error, load, unload, send, sendCoding, stop, clearReply],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeApi {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime richiede RuntimeProvider");
  }
  return ctx;
}
