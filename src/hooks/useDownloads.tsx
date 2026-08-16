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
  cancelDownload,
  discardDownload,
  listDownloads,
  startDownload,
} from "../lib/backend";
import { jobFor, type DownloadJob } from "../lib/download";

type DownloadsApi = {
  jobs: DownloadJob[];
  error: string | null;
  job: (variantId: string) => DownloadJob | undefined;
  start: (modelId: string, variantId: string, manual?: boolean) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
};

const DownloadsContext = createContext<DownloadsApi | null>(null);

function upsert(list: DownloadJob[], next: DownloadJob): DownloadJob[] {
  const index = list.findIndex((item) => item.id === next.id);
  if (index === -1) return [...list, next];
  const copy = [...list];
  copy[index] = next;
  return copy;
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listDownloads()
      .then((items) => {
        if (alive) {
          setJobs(items);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Download non disponibili.");
        }
      });

    const unlistenUpdate = listen<DownloadJob>("downloads-update", (event) => {
      setJobs((current) => upsert(current, event.payload));
    });
    const unlistenForget = listen<string>("download-forgotten", (event) => {
      setJobs((current) =>
        current.filter(
          (job) => job.variantId !== event.payload && job.id !== event.payload,
        ),
      );
    });

    return () => {
      alive = false;
      void unlistenUpdate.then((stop) => stop());
      void unlistenForget.then((stop) => stop());
    };
  }, []);

  const start = useCallback(
    async (modelId: string, variantId: string, manual = false) => {
      try {
        const job = await startDownload(modelId, variantId, manual);
        setJobs((current) => upsert(current, job));
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Non parto il trasferimento.";
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  const cancel = useCallback(async (id: string) => {
    try {
      const job = await cancelDownload(id);
      setJobs((current) => upsert(current, job));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non fermo il trasferimento.");
    }
  }, []);

  const discard = useCallback(async (id: string) => {
    try {
      setJobs(await discardDownload(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non tolgo il pezzo.");
    }
  }, []);

  const value = useMemo<DownloadsApi>(
    () => ({
      jobs,
      error,
      job: (variantId) => jobFor(jobs, variantId),
      start,
      cancel,
      discard,
    }),
    [jobs, error, start, cancel, discard],
  );

  return (
    <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsApi {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error("useDownloads richiede DownloadProvider");
  }
  return ctx;
}
