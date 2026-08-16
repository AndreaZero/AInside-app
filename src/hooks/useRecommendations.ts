import { useEffect, useState } from "react";
import { getRecommendations } from "../lib/backend";
import type { RecommendationSet } from "../lib/catalog";

export type RecommendationsState =
  | { status: "loading" }
  | { status: "ready"; set: RecommendationSet }
  | { status: "error"; message: string };

export function useRecommendations(): RecommendationsState {
  const [state, setState] = useState<RecommendationsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getRecommendations()
      .then((set) => {
        if (!cancelled) {
          setState({ status: "ready", set });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Selezione non disponibile.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
