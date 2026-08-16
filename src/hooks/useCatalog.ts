import { useEffect, useState } from "react";
import { getCatalog } from "../lib/backend";
import type { CatalogFile } from "../lib/catalog";
import { prefetchModelLogos } from "../lib/modelLogo";

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: CatalogFile }
  | { status: "error"; message: string };

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getCatalog()
      .then((catalog) => {
        if (!cancelled) {
          prefetchModelLogos(catalog.models);
          setState({ status: "ready", catalog });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Catalogo non disponibile.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
