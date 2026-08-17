import { useEffect, useState, type ReactNode } from "react";
import { useRuntimeStatus } from "../hooks/useRuntime";
import { getDebugReport } from "../lib/backend";
import { formatDebugDump, type DebugReport } from "../lib/debug";
import { backendList, formatGb } from "../lib/format";
import type { RouteId } from "../navigation/routes";
import { Button } from "../ui/controls";
import { IconCopy, IconRefresh, IconTerminal } from "../ui/icons";
import { ErrorState, InlineAlert } from "../ui/states";

type DebugViewProps = {
  onNavigate: (route: RouteId) => void;
};

export function DebugView({ onNavigate }: DebugViewProps) {
  const runtime = useRuntimeStatus();
  const phase = runtime.snapshot?.phase;
  const [report, setReport] = useState<DebugReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const live = report
    ? {
        ...report,
        runtime: runtime.snapshot ?? report.runtime,
      }
    : null;

  async function reload() {
    try {
      setError(null);
      setReport(await getDebugReport());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non leggo la diagnostica.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await getDebugReport();
        if (!cancelled) {
          setError(null);
          setReport(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Non leggo la diagnostica.");
        }
      }
    }
    void load();
    const busy = phase === "motore" || phase === "avvio";
    const tick = busy ? window.setInterval(() => void load(), 1000) : 0;
    return () => {
      cancelled = true;
      if (tick) window.clearInterval(tick);
    };
  }, [phase]);

  async function copy() {
    if (!live) return;
    try {
      await navigator.clipboard.writeText(formatDebugDump(live));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="page page--wide debug-page">
      <header className="models-hero">
        <p className="page-kicker">Diagnostica</p>
        <h1 className="page-title">Cosa sta facendo il motore.</h1>
        <p className="page-note">
          Qui restano i dettagli tecnici. In chat vedi solo lo stato, in italiano.
        </p>
        <div className="settings-actions">
          <Button onClick={() => onNavigate("settings")}>Torna alle impostazioni</Button>
          <Button onClick={() => void reload()}>
            <IconRefresh size={14} />
            Aggiorna
          </Button>
          <Button variant="primary" onClick={() => void copy()} disabled={!live}>
            <IconCopy size={14} />
            {copied ? "Copiato" : "Copia tutto"}
          </Button>
        </div>
      </header>

      {error ? <ErrorState title="Diagnostica non disponibile" description={error} /> : null}
      {!live && !error ? <InlineAlert>Sto raccogliendo i dati…</InlineAlert> : null}

      {live ? (
        <div className="debug-grid">
          <DebugCard title="App e modello">
            <DebugRow label="App" value={`${live.appName} ${live.appVersion}`} />
            <DebugRow
              label="Stato"
              value={`${live.runtime.phaseLabel} — ${live.runtime.message}`}
            />
            <DebugRow label="Modello" value={live.runtime.modelName ?? "Nessuno in memoria"} />
            <DebugRow label="Variante" value={live.runtime.variantId ?? "—"} />
            <DebugRow label="Dispositivo" value={live.runtime.deviceLabel} />
            <DebugRow label="Esito" value={live.runtime.outcome ?? "—"} />
            <DebugRow label="Profilo" value={live.profile} />
            <DebugRow label="Ragionamento" value={live.thinking ? "Acceso" : "Spento"} />
            <DebugRow label="Esperto" value={live.expert ? "Acceso" : "Spento"} />
          </DebugCard>

          <DebugCard title="Computer">
            <DebugRow
              label="Sistema"
              value={`${live.hardware.os.name ?? "—"} ${live.hardware.os.arch}`}
            />
            <DebugRow
              label="Processore"
              value={`${live.hardware.cpu.name ?? "—"} · ${live.hardware.cpu.cores ?? "—"} core`}
            />
            <DebugRow
              label="Memoria"
              value={`${formatGb(live.hardware.memory.totalBytes)} tot · ${formatGb(live.hardware.memory.availableBytes)} libera`}
            />
            <DebugRow
              label="Scheda"
              value={
                live.hardware.gpus[0]
                  ? `${live.hardware.gpus[0].name} · ${formatGb(live.hardware.gpus[0].vramBytes)}`
                  : "Nessuna scheda rilevata"
              }
            />
            <DebugRow label="Backend" value={backendList(live.hardware.backends)} />
            <DebugRow label="Motore" value={`${live.engineKind} ${live.engineTag ?? ""}`.trim()} />
            <DebugRow label="Cartella modelli" value={live.downloadRoot} />
            <DebugRow label="Log su disco" value={live.runtimeDir} />
          </DebugCard>

          <DebugCard title="Piano di avvio" wide>
            <pre className="debug-pre">{live.planDetail.trim() || "Nessun piano salvato."}</pre>
          </DebugCard>

          <DebugCard
            title="Log del motore"
            wide
            kicker={
              <span className="debug-kicker">
                <IconTerminal size={14} />
                llama.cpp
              </span>
            }
          >
            <pre className="debug-pre">
              {live.loadLog.trim() || "Ancora nessuna riga da llama.cpp."}
            </pre>
          </DebugCard>
        </div>
      ) : null}
    </section>
  );
}

function DebugCard({
  title,
  children,
  wide,
  kicker,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
  kicker?: ReactNode;
}) {
  return (
    <article className={wide ? "debug-card is-wide" : "debug-card"}>
      <header className="debug-card-head">
        {kicker}
        <h2>{title}</h2>
      </header>
      {children}
    </article>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="debug-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}
