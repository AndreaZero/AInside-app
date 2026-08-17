import { useCallback, useEffect, useState } from "react";
import {
  addLibraryRoot,
  codingGrant,
  codingRevoke,
  getApiStatus,
  getSettings,
  removeLibraryRoot,
  setApiEnabled,
  setDownloadRoot,
  setExpert,
  setPerfProfile,
  setThinking,
} from "../lib/backend";
import type { ApiStatus, AppSettings, ExpertSettings, PerfProfile } from "../lib/settings";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSettings(await getSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impostazioni non disponibili.");
      return;
    }
    try {
      setApiStatus(await getApiStatus());
    } catch {
      setApiStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeDownloadRoot = useCallback(async (path: string) => {
    setSettings(await setDownloadRoot(path));
  }, []);

  const addRoot = useCallback(async (path: string) => {
    setSettings(await addLibraryRoot(path));
  }, []);

  const removeRoot = useCallback(async (path: string) => {
    setSettings(await removeLibraryRoot(path));
  }, []);

  const changeProfile = useCallback(async (profile: PerfProfile) => {
    setSettings(await setPerfProfile(profile));
  }, []);

  const changeExpert = useCallback(async (expert: ExpertSettings) => {
    setSettings(await setExpert(expert));
  }, []);

  const changeThinking = useCallback(async (enabled: boolean) => {
    setSettings(await setThinking(enabled));
  }, []);

  const changeApiEnabled = useCallback(async (enabled: boolean) => {
    setApiStatus(await setApiEnabled(enabled));
    setSettings(await getSettings());
  }, []);

  const grantCoding = useCallback(
    async (level: "session" | "folder" | "always" | "ask", root?: string | null) => {
      await codingGrant(level, root);
      setSettings(await getSettings());
    },
    [],
  );

  const revokeCoding = useCallback(async (root?: string | null) => {
    await codingRevoke(root);
    setSettings(await getSettings());
  }, []);

  return {
    settings,
    apiStatus,
    error,
    changeDownloadRoot,
    addRoot,
    removeRoot,
    changeProfile,
    changeExpert,
    changeThinking,
    changeApiEnabled,
    grantCoding,
    revokeCoding,
  };
}
