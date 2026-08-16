import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getHardwareProfile } from "../lib/backend";
import type { HardwareProfile } from "../lib/profile";

export type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: HardwareProfile }
  | { status: "error" };

type HardwareApi = ProfileState & { reload: () => Promise<void> };

const HardwareContext = createContext<HardwareApi | null>(null);

export function HardwareProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const profile = await getHardwareProfile();
      setState({ status: "ready", profile });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<HardwareApi>(() => ({ ...state, reload }), [state, reload]);

  return <HardwareContext.Provider value={value}>{children}</HardwareContext.Provider>;
}

export function useHardwareProfile(): HardwareApi {
  const ctx = useContext(HardwareContext);
  if (!ctx) {
    throw new Error("useHardwareProfile richiede HardwareProvider");
  }
  return ctx;
}
