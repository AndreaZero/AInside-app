import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

type RuntimeStatus = {
  snapshot: RuntimeSnapshot | null;
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

type RuntimeApi = RuntimeStatus & { reply: string };

const StatusContext = createContext<RuntimeStatus | null>(null);
const ReplyContext = createContext("");

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef("");
  const raf = useRef(0);

  const dropQueued = useCallback(() => {
    pending.current = "";
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
  }, []);

  const takeQueued = useCallback(() => {
    const chunk = pending.current;
    dropQueued();
    return chunk;
  }, [dropQueued]);

  const resetReply = useCallback(() => {
    dropQueued();
    setReply("");
  }, [dropQueued]);

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
      const chunk = takeQueued();
      if (chunk) setReply((current) => current + chunk);
      setSnapshot(event.payload);
    });
    const unlistenToken = listen<TokenChunk>("runtime-token", (event) => {
      if (!event.payload.text) return;
      pending.current += event.payload.text;
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const chunk = pending.current;
        pending.current = "";
        if (chunk) setReply((current) => current + chunk);
      });
    });

    return () => {
      alive = false;
      dropQueued();
      void unlistenStatus.then((stop) => stop());
      void unlistenToken.then((stop) => stop());
    };
  }, [dropQueued, takeQueued]);

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
      resetReply();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non fermo il modello.");
    }
  }, [resetReply]);

  const send = useCallback(async (messages: ChatTurn[]) => {
    try {
      resetReply();
      setSnapshot(await startCompletion(messages));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Non parto la risposta.";
      setError(message);
      throw new Error(message);
    }
  }, [resetReply]);

  const sendCoding = useCallback(
    async (input: { messages: ChatTurn[]; workspace: string; cited?: string[] }) => {
      try {
        resetReply();
        setSnapshot(await startCodingTurn(input));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Non parto la risposta.";
        setError(message);
        throw new Error(message);
      }
    },
    [resetReply],
  );

  const stop = useCallback(async () => {
    try {
      const chunk = takeQueued();
      if (chunk) setReply((current) => current + chunk);
      setSnapshot(await stopCompletion());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non fermo la risposta.");
    }
  }, [takeQueued]);

  const status = useMemo<RuntimeStatus>(
    () => ({
      snapshot,
      error,
      load,
      unload,
      send,
      sendCoding,
      stop,
      clearReply: resetReply,
    }),
    [snapshot, error, load, unload, send, sendCoding, stop, resetReply],
  );

  return (
    <StatusContext.Provider value={status}>
      <ReplyContext.Provider value={reply}>{children}</ReplyContext.Provider>
    </StatusContext.Provider>
  );
}

export function useRuntimeStatus(): RuntimeStatus {
  const ctx = useContext(StatusContext);
  if (!ctx) {
    throw new Error("useRuntime richiede RuntimeProvider");
  }
  return ctx;
}

export function useRuntimeReply(): string {
  return useContext(ReplyContext);
}

export function useRuntime(): RuntimeApi {
  const status = useRuntimeStatus();
  const reply = useRuntimeReply();
  return { ...status, reply };
}
