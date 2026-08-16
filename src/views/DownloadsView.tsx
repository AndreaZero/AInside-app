import { useCatalog } from "../hooks/useCatalog";
import { useDownloadPace } from "../hooks/useDownloadPace";
import { useDownloads } from "../hooks/useDownloads";
import { useLibrary } from "../hooks/useLibrary";
import { useRecommendations } from "../hooks/useRecommendations";
import { useSettings } from "../hooks/useSettings";
import {
  CATEGORY_LABEL,
  type CatalogModel,
  type ModelRecommendation,
} from "../lib/catalog";
import { cx } from "../lib/cx";
import { downloadFailKind, repoFromPath } from "../lib/downloadFail";
import { isActive, jobBarBytes, type DownloadJob } from "../lib/download";
import {
  formatEta,
  formatGb,
  formatPercent,
  formatProgress,
  formatRate,
  paramHint,
} from "../lib/format";
import { removeCopy } from "../lib/library";
import type { RouteId } from "../navigation/routes";
import { Button, ProgressBar, StatusBadge, type StatusKind } from "../ui/controls";
import { useFeedback } from "../ui/overlays";
import { EmptyState, ErrorState, InlineAlert } from "../ui/states";
import { DownloadRig, EmptyGlyph } from "../visuals/DownloadRig";
import { ModelLogo } from "../visuals/ModelLogo";
import {
  CATEGORY_TONE,
  HoloTag,
  fitTone,
  speedTone,
  weightTone,
  type HoloTone,
} from "./models/tags";

export function DownloadsView({ onNavigate }: { onNavigate: (route: RouteId) => void }) {
  const { jobs, error, start, cancel, discard } = useDownloads();
  const library = useLibrary();
  const { settings } = useSettings();
  const catalog = useCatalog();
  const recs = useRecommendations();
  const models = catalog.status === "ready" ? catalog.catalog.models : [];
  const picks = recs.status === "ready" ? recs.set.picks : [];
  const active = jobs.filter((job) => job.status !== "pronto");
  const ready = jobs.filter((job) => {
    if (job.status !== "pronto") return false;
    return !library.snapshot || Boolean(library.item(job.variantId));
  });

  if (jobs.length === 0) {
    return (
      <section className="page page--wide downloads-page">
        <header className="models-hero">
          <p className="page-kicker">Trasferimenti</p>
          <h1 className="page-title">Nessun download</h1>
        </header>
        <EmptyState
          visual={<EmptyGlyph />}
          title="Ancora vuoto"
          description="Quando scegli un modello, il file arriva qui sul disco. Non si installa dentro AInside: è un file sul tuo computer."
          action={
            <Button variant="primary" onClick={() => onNavigate("models")}>
              Sfoglia i modelli
            </Button>
          }
        />
        {settings && (
          <p className="page-note" style={{ marginTop: 16 }}>
            I file finiscono in {settings.library.downloadRoot}.
          </p>
        )}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      </section>
    );
  }

  return (
    <section className="page page--wide downloads-page">
      <header className="models-hero">
        <p className="page-kicker">Trasferimenti</p>
        <h1 className="page-title">{active.length > 0 ? "In trasferimento" : "Sul disco"}</h1>
        <p className="page-note">
          AInside non tiene i file. Li prende da Hugging Face e li scrive nella cartella del
          computer. Quando è pronto, da Chat lo accendi.
        </p>
        {settings ? (
          <div className="holo-row dl-folder">
            <HoloTag tone="ghost" label="Cartella">
              {settings.library.downloadRoot}
            </HoloTag>
          </div>
        ) : null}
      </header>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {active.length > 0 && (
        <div className="model-grid">
          {active.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              model={models.find((item) => item.id === job.modelId)}
              pick={picks.find((item) => item.model.id === job.modelId)}
              featured={index === 0}
              onStart={() => void start(job.modelId, job.variantId, true)}
              onCancel={() => void cancel(job.id)}
              onDiscard={() => void discard(job.id)}
            />
          ))}
        </div>
      )}

      {ready.length > 0 && (
        <>
          {active.length > 0 ? (
            <p className="page-kicker" style={{ marginTop: 28 }}>
              Sul disco
            </p>
          ) : null}
          <div className="model-grid">
            {ready.map((job) => (
              <ReadyCard
                key={job.id}
                job={job}
                model={models.find((item) => item.id === job.modelId)}
                pick={picks.find((item) => item.model.id === job.modelId)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function JobSpecs({
  job,
  model,
  pick,
  repo,
}: {
  job: DownloadJob;
  model?: CatalogModel;
  pick?: ModelRecommendation;
  repo?: string | null;
}) {
  const variant = model?.variants.find((item) => item.id === job.variantId);
  const params = paramHint(job.modelName);
  const size = variant?.sizeBytes ?? job.expectedBytes;
  const source = repo ?? model?.stats?.repo ?? null;

  return (
    <>
      {model?.description ? <p className="model-desc">{model.description}</p> : null}
      <div className="holo-row">
        {params ? (
          <HoloTag tone="magenta" label="Pesi">
            {params}
          </HoloTag>
        ) : null}
        <HoloTag tone={weightTone(size)} label="Peso">
          {formatGb(size)}
        </HoloTag>
        {variant ? <HoloTag tone="cyan" label="Quant">{variant.quant}</HoloTag> : null}
        {pick ? <HoloTag tone={speedTone(pick.speed)}>{pick.speedLabel}</HoloTag> : null}
        {pick ? <HoloTag tone={fitTone(pick.fit)}>{pick.fitLabel}</HoloTag> : null}
        {(model?.categories ?? []).map((id) => (
          <HoloTag key={id} tone={CATEGORY_TONE[id] ?? "ghost"}>
            {CATEGORY_LABEL[id] ?? id}
          </HoloTag>
        ))}
        {model && model.quality.italian >= 3 ? <HoloTag tone="cyan">Italiano</HoloTag> : null}
        {model && model.quality.coding >= 4 ? <HoloTag tone="blue">Codice</HoloTag> : null}
        {model && model.quality.reasoning >= 4 ? (
          <HoloTag tone="purple">Ragionamento</HoloTag>
        ) : null}
        {model?.author ? <HoloTag tone="ghost">{model.author}</HoloTag> : null}
        {source ? (
          <HoloTag tone="ghost" label="Repo">
            {source}
          </HoloTag>
        ) : null}
      </div>
    </>
  );
}

function statusKind(job: DownloadJob): StatusKind {
  switch (job.status) {
    case "inCoda":
      return "paused";
    case "inCorso":
      return "download";
    case "controllo":
      return "verify";
    case "pronto":
      return "pronto";
    case "inPausa":
      return "paused";
    case "fallito":
      return "error";
    default:
      return "download";
  }
}

function paceTone(job: DownloadJob): HoloTone {
  if (job.status === "fallito") return "rose";
  if (job.status === "controllo") return "amber";
  if (job.status === "pronto") return "lime";
  if (job.status === "inPausa" || job.status === "inCoda") return "ghost";
  return "cyan";
}

function JobCard({
  job,
  model,
  pick,
  featured,
  onStart,
  onCancel,
  onDiscard,
}: {
  job: DownloadJob;
  model?: CatalogModel;
  pick?: ModelRecommendation;
  featured?: boolean;
  onStart?: () => void;
  onCancel?: () => void;
  onDiscard?: () => void;
}) {
  const feedback = useFeedback();
  const pace = useDownloadPace(job);
  const barBytes = jobBarBytes(job);
  const pct = formatPercent(barBytes, job.expectedBytes);
  const fail = job.status === "fallito" ? downloadFailKind(job) : null;
  const repo = repoFromPath(job.destPath);
  const tone =
    job.status === "fallito"
      ? "danger"
      : job.status === "controllo"
        ? "warning"
        : job.status === "pronto"
          ? "success"
          : "cyan";
  const live = job.status === "inCorso" || job.status === "controllo";

  return (
    <article className={cx("model-card", "dl-card", featured && "is-featured", live && "is-live")}>
      <div className="model-card-shine" aria-hidden />
      {featured ? (
        <div className="dl-rig-slot" aria-hidden>
          <DownloadRig active={live} />
        </div>
      ) : null}
      <header className="model-card-head">
        <ModelLogo seed={job.modelId} source={model ?? { id: job.modelId, name: job.modelName }} />
        <div className="model-card-title">
          <h2>{job.modelName}</h2>
          <div className="holo-row">
            <StatusBadge kind={statusKind(job)}>{job.statusLabel}</StatusBadge>
          </div>
        </div>
        <span className="model-speed">{pct}%</span>
      </header>
      <JobSpecs job={job} model={model} pick={pick} repo={repo} />
      <div className="dl-progress">
        <ProgressBar value={pct} tone={tone} />
        <div className="holo-row">
          <HoloTag tone={paceTone(job)} label="Avanzamento">
            {pct}%
          </HoloTag>
          <HoloTag tone="blue" label="Scritto">
            {formatProgress(barBytes, job.expectedBytes)}
          </HoloTag>
          <HoloTag tone="lime" label="Velocità">
            {formatRate(pace.bytesPerSec ?? 0)}
          </HoloTag>
          <HoloTag tone="purple" label="Tempo">
            {formatEta(pace.etaSec)}
          </HoloTag>
        </div>
      </div>
      {job.status === "inCoda" && (
        <InlineAlert tone="info">In attesa. Parte appena c’è spazio nel trasferimento.</InlineAlert>
      )}
      {job.status === "controllo" && (
        <InlineAlert tone="warning">
          {job.message || "Controllo che il file sia integro. Non chiudere l’app."}
        </InlineAlert>
      )}
      {job.status === "inPausa" && (
        <InlineAlert>Download in pausa. Puoi riprendere o togliere il pezzo.</InlineAlert>
      )}
      {fail === "checksum" && (
        <ErrorState
          title="Il file non è integro"
          description="La verifica checksum è fallita. Meglio togliere il pezzo e scaricare di nuovo."
          detail={job.errorDetail}
        />
      )}
      {fail === "network" && (
        <ErrorState
          title="Rete interrotta"
          description="Il trasferimento si è fermato. Controlla la connessione e riprendi."
          detail={job.errorDetail}
        />
      )}
      {fail === "generic" && (
        <ErrorState
          title="Download non riuscito"
          description={job.message}
          detail={job.errorDetail}
        />
      )}
      <div className="model-card-foot">
        <div className="model-actions">
          {isActive(job) && onCancel && (
            <Button
              onClick={() => {
                void feedback
                  .confirm({
                    title: "Annullare il download?",
                    description:
                      "Il trasferimento si ferma. Il pezzo già scritto resta finché non lo togli.",
                    confirmLabel: "Annulla download",
                    danger: true,
                  })
                  .then((ok) => {
                    if (ok) onCancel();
                  });
              }}
            >
              Annulla
            </Button>
          )}
          {(job.status === "inPausa" || job.status === "fallito") && onStart && (
            <Button variant="primary" onClick={onStart}>
              Riprendi
            </Button>
          )}
          {(job.status === "inPausa" || job.status === "fallito") && onDiscard && (
            <Button variant="ghost" onClick={onDiscard}>
              Togli il pezzo
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function ReadyCard({
  job,
  model,
  pick,
  onNavigate,
}: {
  job: DownloadJob;
  model?: CatalogModel;
  pick?: ModelRecommendation;
  onNavigate: (route: RouteId) => void;
}) {
  const { item, useModel, forget } = useLibrary();
  const feedback = useFeedback();
  const installed = item(job.variantId);

  return (
    <article className="model-card dl-card">
      <div className="model-card-shine" aria-hidden />
      <header className="model-card-head">
        <ModelLogo seed={job.modelId} source={model ?? { id: job.modelId, name: job.modelName }} />
        <div className="model-card-title">
          <h2>{job.modelName}</h2>
          <div className="holo-row">
            <StatusBadge kind="pronto">{installed?.active ? "In uso" : "Pronto"}</StatusBadge>
          </div>
        </div>
        <span className="model-speed">100%</span>
      </header>
      <JobSpecs job={job} model={model} pick={pick} />
      <div className="dl-progress">
        <ProgressBar value={100} tone="success" />
        <div className="holo-row">
          <HoloTag tone="lime">Completato</HoloTag>
          <HoloTag tone="blue" label="Peso">
            {formatProgress(job.receivedBytes, job.expectedBytes)}
          </HoloTag>
        </div>
      </div>
      <div className="model-card-foot">
        <div className="model-actions">
          <Button
            variant={installed?.active ? "success" : "primary"}
            onClick={() =>
              void useModel(job.modelId, job.variantId).then(() => onNavigate("chat"))
            }
          >
            {installed?.active ? "Apri chat" : "Usa"}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const copy = removeCopy(job.modelName);
              void feedback.confirm({ ...copy, danger: true, confirmLabel: "Elimina" }).then((ok) => {
                if (ok) void forget(job.variantId);
              });
            }}
          >
            Elimina
          </Button>
        </div>
      </div>
    </article>
  );
}
