import { useRuntimeStatus } from "../hooks/useRuntime";
import { cx } from "../lib/cx";
import { formatProgress } from "../lib/format";
import type { RouteId } from "../navigation/routes";
import { Button } from "../ui/controls";

export function RuntimeBanner({ onNavigate }: { onNavigate: (route: RouteId) => void }) {
  const runtime = useRuntimeStatus();
  const snap = runtime.snapshot;
  if (!snap) return null;
  if (snap.phase !== "motore" && snap.phase !== "avvio" && snap.phase !== "errore") {
    return null;
  }

  const loading = snap.phase === "motore" || snap.phase === "avvio";

  return (
    <div
      className={cx("runtime-strip", snap.phase === "errore" && "is-error")}
      role="status"
    >
      <div className="runtime-strip-row">
        <span className={cx("runtime-strip-dot", loading && "is-pulse")} />
        <p>{snap.message}</p>
        {snap.phase === "motore" && snap.expectedBytes > 0 ? (
          <span className="runtime-strip-bytes">
            {formatProgress(snap.receivedBytes, snap.expectedBytes)}
          </span>
        ) : null}
        <Button variant="ghost" onClick={() => onNavigate("debug")}>
          Diagnostica
        </Button>
      </div>
      {loading ? (
        <p className="runtime-strip-note">
          Non è istantaneo: i pesi passano dal disco alla memoria. Resta pronto finché
          l’app è aperta. Cambiare modello ricarica il file.
        </p>
      ) : null}
    </div>
  );
}
