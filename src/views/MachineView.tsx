import { useState } from "react";
import { useHardwareProfile } from "../hooks/useHardwareProfile";
import { backendLine, formatGb } from "../lib/format";
import { performanceFill } from "../lib/resources";
import type { RouteId } from "../navigation/routes";
import { Button } from "../ui/controls";
import { CircularGauge } from "../ui/Gauge";
import { ErrorState, InlineAlert, Skeleton } from "../ui/states";
import { HeroScene } from "../visuals/HeroCube";

const ANALYZED_KEY = "ainside.analyzed";

type MachineViewProps = {
  onNavigate: (route: RouteId) => void;
};

export function MachineView({ onNavigate }: MachineViewProps) {
  const machine = useHardwareProfile();
  const [phase, setPhase] = useState<"hero" | "running" | "done">(() =>
    sessionStorage.getItem(ANALYZED_KEY) === "1" ? "done" : "hero",
  );
  const [details, setDetails] = useState(false);

  async function analyze() {
    setPhase("running");
    await machine.reload();
    sessionStorage.setItem(ANALYZED_KEY, "1");
    setPhase("done");
  }

  if (phase === "hero") {
    return (
      <section className="page page--fill home">
        <HeroScene />
        <div className="home-content">
          <p className="page-kicker">Sul tuo computer</p>
          <h1>AInside</h1>
          <p className="hero-payoff">
            L&apos;AI locale, semplice e potente. Analizziamo il PC e ti
            proponiamo i modelli giusti.
          </p>
          <div className="hero-cta">
            <Button variant="primary" onClick={() => void analyze()}>
              Analizza il computer
            </Button>
            <Button onClick={() => onNavigate("models")}>Esplora i modelli</Button>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "running" || machine.status === "loading") {
    return (
      <section className="page">
        <p className="page-kicker">Analisi hardware</p>
        <h1 className="page-title">Sto guardando il computer.</h1>
        <p className="page-note">Processore, scheda, memoria e spazio. Un attimo.</p>
        <div className="hw-panel">
          <Skeleton lines={4} />
          <Skeleton lines={5} />
        </div>
      </section>
    );
  }

  if (machine.status === "error") {
    return (
      <section className="page">
        <ErrorState
          title="Non riesco a leggere il computer"
          description="Puoi comunque esplorare i modelli. Le stime arriveranno al prossimo avvio."
          action={
            <Button variant="primary" onClick={() => void analyze()}>
              Riprova
            </Button>
          }
        />
      </section>
    );
  }

  const { profile } = machine;
  const { hardware, summary, performance, performanceLabel } = profile;
  const gaugeTone =
    performance === "limited" || performance === "fair" ? "warning" : "cyan";

  return (
    <section className="page">
      <p className="page-kicker">Il tuo computer</p>
      <h1 className="page-title">Analisi pronta.</h1>
      <p className="page-note">{summary.note}</p>

      <div className="hw-panel">
        <CircularGauge
          value={performanceFill(performance)}
          title="Prestazioni AI"
          label={performanceLabel}
          tone={gaugeTone}
        />
        <dl className="hw-facts">
          <div>
            <dt>CPU</dt>
            <dd>{summary.cpuLine}</dd>
          </div>
          <div>
            <dt>GPU</dt>
            <dd>{summary.gpuLine}</dd>
          </div>
          <div>
            <dt>VRAM</dt>
            <dd>{formatGb(hardware.gpus[0]?.vramBytes ?? null)}</dd>
          </div>
          <div>
            <dt>RAM</dt>
            <dd>{summary.ramLine}</dd>
          </div>
          <div>
            <dt>Spazio</dt>
            <dd>
              {hardware.disk.availableBytes != null
                ? `${formatGb(hardware.disk.availableBytes)} liberi`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{backendLine(hardware.backends)}</dd>
          </div>
        </dl>
        <div className="hw-callout">
          <InlineAlert tone={performance === "limited" ? "warning" : "success"}>
            {summary.note}
          </InlineAlert>
        </div>
      </div>

      <div className="hero-actions" style={{ marginTop: 20, maxWidth: 520 }}>
        <Button variant="primary" onClick={() => onNavigate("models")}>
          Esplora i modelli
        </Button>
        <Button aria-expanded={details} onClick={() => setDetails((open) => !open)}>
          {details ? "Nascondi dettagli" : "Mostra dettagli"}
        </Button>
      </div>

      {details && (
        <dl className="hw-facts" style={{ marginTop: 24 }}>
          <div>
            <dt>Sistema</dt>
            <dd>
              {[hardware.os.name, hardware.os.version].filter(Boolean).join(" — ") || "—"}
            </dd>
          </div>
          <div>
            <dt>Architettura</dt>
            <dd>{hardware.os.arch}</dd>
          </div>
          <div>
            <dt>Core / thread</dt>
            <dd>
              {hardware.cpu.cores ?? "—"} / {hardware.cpu.threads ?? "—"}
            </dd>
          </div>
          <div>
            <dt>RAM libera</dt>
            <dd>{formatGb(hardware.memory.availableBytes)}</dd>
          </div>
          <div>
            <dt>Disco</dt>
            <dd>{hardware.disk.path ?? "—"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
