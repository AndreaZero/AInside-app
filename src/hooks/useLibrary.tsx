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
  clearActiveModel,
  listLibrary,
  removeInstalled,
  setActiveModel,
} from "../lib/backend";
import type { DownloadJob } from "../lib/download";
import { itemFor, type LibraryItem, type LibrarySnapshot } from "../lib/library";

type LibraryApi = {
  snapshot: LibrarySnapshot | null;
  error: string | null;
  item: (variantId: string) => LibraryItem | undefined;
  refresh: () => Promise<void>;
  useModel: (modelId: string, variantId: string) => Promise<void>;
  forget: (variantId: string) => Promise<void>;
  clearActive: () => Promise<void>;
};

const LibraryContext = createContext<LibraryApi | null>(null);

const empty: LibrarySnapshot = {
  items: [],
  totalBytes: 0,
  readyCount: 0,
  active: null,
};

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await listLibrary());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Libreria non disponibile.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unlisten = listen<DownloadJob>("downloads-update", (event) => {
      if (
        event.payload.status === "pronto" ||
        event.payload.status === "fallito" ||
        event.payload.status === "inPausa"
      ) {
        void refresh();
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [refresh]);

  const useModel = useCallback(async (modelId: string, variantId: string) => {
    try {
      setSnapshot(await setActiveModel(modelId, variantId));
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Non imposto questo modello.";
      setError(message);
      throw new Error(message);
    }
  }, []);

  const forget = useCallback(async (variantId: string) => {
    try {
      setSnapshot(await removeInstalled(variantId));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Non tolgo il file.";
      setError(message);
      throw new Error(message);
    }
  }, []);

  const clearActive = useCallback(async () => {
    try {
      setSnapshot(await clearActiveModel());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non tolgo il modello attivo.");
    }
  }, []);

  const value = useMemo<LibraryApi>(
    () => ({
      snapshot,
      error,
      item: (variantId) => itemFor(snapshot?.items ?? [], variantId),
      refresh,
      useModel,
      forget,
      clearActive,
    }),
    [snapshot, error, refresh, useModel, forget, clearActive],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryApi {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary richiede LibraryProvider");
  }
  return ctx;
}

export function useLibrarySnapshot(): LibrarySnapshot {
  return useLibrary().snapshot ?? empty;
}
