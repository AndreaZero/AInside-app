import { useRuntime } from "../hooks/useRuntime";
import { cx } from "../lib/cx";
import { formatProgress } from "../lib/format";
import type { RuntimeSnapshot } from "../lib/runtime";

export function RuntimeBanner() {
  const runtime = useRuntime();
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
      </div>
      {loading ? (
        <p className="runtime-strip-note">
          Non è istantaneo: i pesi passano dal disco alla memoria. Resta pronto finché
          l’app è aperta. Cambiare modello ricarica il file.
        </p>
      ) : null}
      <RuntimeLoadLog snapshot={snap} />
    </div>
  );
}

export function RuntimeLoadLog({ snapshot }: { snapshot: RuntimeSnapshot }) {
  const detail = (snapshot.log ?? snapshot.errorDetail ?? "").trim();
  return (
    <details className="runtime-strip-log" open>
      <summary>Cosa sta facendo il motore</summary>
      <pre>
        {detail ||
          "Ancora nessuna riga da llama.cpp. Se resta fermo su «preparo il motore», il giro è bloccato prima dell’avvio, oppure l’interfaccia non ha ancora ricevuto l’errore."}
      </pre>
    </details>
  );
}
