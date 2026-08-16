import { useEffect, useState } from "react";
import { getAppInfo } from "../lib/backend";

export type BackendStatus =
  | { state: "loading" }
  | { state: "waiting" }
  | { state: "ready"; name: string; version: string };

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    getAppInfo()
      .then((info) => {
        if (!cancelled) {
          setStatus({ state: "ready", name: info.name, version: info.version });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ state: "waiting" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
