import { useState } from "react";
import { useDownloads } from "../../hooks/useDownloads";
import { useLibrary } from "../../hooks/useLibrary";
import {
  CATEGORY_LABEL,
  type CatalogModel,
  type GgufVariant,
  type ModelRecommendation,
} from "../../lib/catalog";
import { cx } from "../../lib/cx";
import { isActive, jobBarBytes } from "../../lib/download";
import { formatGb, formatProgress, formatSize, paramHint } from "../../lib/format";
import { removeCopy } from "../../lib/library";
import type { RouteId } from "../../navigation/routes";
import { Button, StatusBadge } from "../../ui/controls";
import { useFeedback } from "../../ui/overlays";
import { ModelLogo } from "../../visuals/ModelLogo";
import { CATEGORY_TONE, HoloTag, speedTone, weightTone } from "./tags";

export function PickCard({
  pick,
  featured,
  onNavigate,
}: {
  pick: ModelRecommendation;
  featured?: boolean;
  onNavigate: (route: RouteId) => void;
}) {
  const [open, setOpen] = useState(false);
  const downloads = useDownloads();
  const benches = pick.model.stats?.benches ?? [];
  const params = paramHint(pick.model.name);
  const size = pick.recommended.sizeBytes;

  return (
    <article className={cx("model-card", featured && "is-featured")}>
      <div className="model-card-shine" aria-hidden />
      <header className="model-card-head">
        <ModelLogo seed={pick.model.id} source={pick.model} />
        <div className="model-card-title">
          <h2>{pick.model.name}</h2>
          <div className="holo-row">
            {featured || pick.fit === "comodo" ? <StatusBadge kind="recommended" /> : null}
            {pick.model.categories.includes("leggeri") || size < 4 * 1024 ** 3 ? (
              <StatusBadge kind="light" />
            ) : null}
            {pick.model.quality.overall >= 4 ? <StatusBadge kind="quality" /> : null}
          </div>
        </div>
        <span className="model-speed">{pick.speedLabel}</span>
      </header>

      <p className="model-desc">{pick.model.description}</p>
      <p className="model-reason">{pick.reason}</p>

      <div className="holo-row">
        {params ? (
          <HoloTag tone="magenta" label="Pesi">
            {params}
          </HoloTag>
        ) : null}
        <HoloTag tone={weightTone(size)} label="Peso">
          {formatGb(size)}
        </HoloTag>
        <HoloTag tone={speedTone(pick.speed)}>{pick.speedLabel}</HoloTag>
        {pick.model.categories.map((id) => (
          <HoloTag key={id} tone={CATEGORY_TONE[id] ?? "ghost"}>
            {CATEGORY_LABEL[id] ?? id}
          </HoloTag>
        ))}
        {pick.model.quality.italian >= 3 ? <HoloTag tone="cyan">Italiano</HoloTag> : null}
        {pick.model.quality.coding >= 4 ? <HoloTag tone="blue">Codice</HoloTag> : null}
        {pick.model.quality.reasoning >= 4 ? (
          <HoloTag tone="purple">Ragionamento</HoloTag>
        ) : null}
      </div>

      <div className="model-card-foot">
        <DownloadActions
          modelId={pick.model.id}
          variantId={pick.recommended.id}
          modelName={pick.model.name}
          onNavigate={onNavigate}
        />
        <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Nascondi avanzate" : "Avanzate"}
        </Button>
      </div>

      {open && (
        <dl className="model-advanced">
          <div>
            <dt>Autore</dt>
            <dd>{pick.model.author}</dd>
          </div>
          <div>
            <dt>Licenza</dt>
            <dd>{pick.model.license}</dd>
          </div>
          <div>
            <dt>Quantizzazione</dt>
            <dd>{pick.recommended.quant}</dd>
          </div>
          {pick.model.stats && (
            <>
              <div>
                <dt>Repository</dt>
                <dd>{pick.model.stats.repo}</dd>
              </div>
              <div>
                <dt>Download</dt>
                <dd>
                  {pick.model.stats.downloads.toLocaleString("it-IT")} ·{" "}
                  {pick.model.stats.likes.toLocaleString("it-IT")} preferiti
                </dd>
              </div>
            </>
          )}
          {benches.map((bench) => (
            <div key={`${bench.label}-${bench.source}`}>
              <dt>{bench.label}</dt>
              <dd>
                {bench.value} · {bench.source}
              </dd>
            </div>
          ))}
          <VariantRow
            modelId={pick.model.id}
            variant={pick.recommended}
            chosen
            onNavigate={onNavigate}
            onDownload={() => void downloads.start(pick.model.id, pick.recommended.id, false)}
          />
          {pick.alternatives.map((variant) => (
            <VariantRow
              key={variant.id}
              modelId={pick.model.id}
              variant={variant}
              onNavigate={onNavigate}
              onDownload={() => void downloads.start(pick.model.id, variant.id, true)}
            />
          ))}
        </dl>
      )}
    </article>
  );
}

export function HiddenCard({ model }: { model: CatalogModel }) {
  const smallest = [...model.variants].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
  const params = paramHint(model.name);

  return (
    <article className="model-card is-dim">
      <div className="model-card-shine" aria-hidden />
      <header className="model-card-head">
        <ModelLogo seed={model.id} source={model} />
        <div className="model-card-title">
          <h2>{model.name}</h2>
          <div className="holo-row">
            <StatusBadge kind="incompatible" />
          </div>
        </div>
      </header>
      <p className="model-desc">{model.description}</p>
      <div className="holo-row">
        {params ? (
          <HoloTag tone="ghost" label="Pesi">
            {params}
          </HoloTag>
        ) : null}
        {smallest ? (
          <HoloTag tone="ghost" label="Peso">
            da {formatGb(smallest.sizeBytes)}
          </HoloTag>
        ) : null}
        {model.categories.map((id) => (
          <HoloTag key={id} tone="ghost">
            {CATEGORY_LABEL[id] ?? id}
          </HoloTag>
        ))}
        <HoloTag tone="rose">Troppo pesante</HoloTag>
      </div>
    </article>
  );
}

function VariantRow({
  modelId,
  variant,
  chosen = false,
  onNavigate,
  onDownload,
}: {
  modelId: string;
  variant: GgufVariant;
  chosen?: boolean;
  onNavigate: (route: RouteId) => void;
  onDownload?: () => void;
}) {
  const library = useLibrary();
  const installed = library.item(variant.id);

  return (
    <div>
      <dt>{chosen ? `${variant.quant} · scelta` : variant.quant}</dt>
      <dd>
        {formatGb(variant.sizeBytes)} · {variant.filename}
        {installed?.status === "pronto" ? (
          <>
            {" "}
            <Button
              variant="ghost"
              onClick={() =>
                void library.useModel(modelId, variant.id).then(() => onNavigate("chat"))
              }
            >
              {installed.active ? "In uso" : "Usa"}
            </Button>
          </>
        ) : onDownload ? (
          <>
            {" "}
            <Button variant="ghost" onClick={onDownload}>
              Scarica questa
            </Button>
          </>
        ) : null}
      </dd>
    </div>
  );
}

export function DownloadActions({
  modelId,
  variantId,
  modelName,
  onNavigate,
}: {
  modelId: string;
  variantId: string;
  modelName: string;
  onNavigate: (route: RouteId) => void;
}) {
  const { jobs, job, start, cancel } = useDownloads();
  const library = useLibrary();
  const feedback = useFeedback();
  const [localError, setLocalError] = useState<string | null>(null);
  const current = job(variantId);
  const installed = library.item(variantId);
  const other = jobs.find(
    (item) =>
      item.modelId === modelId && item.variantId !== variantId && item.status !== "pronto",
  );

  return (
    <div>
      <div className="model-actions">
        {installed?.status === "pronto" ? (
          <Button
            variant={installed.active ? "success" : "primary"}
            onClick={() =>
              void library.useModel(modelId, variantId).then(() => onNavigate("chat"))
            }
          >
            {installed.active ? "Apri chat" : "Usa"}
          </Button>
        ) : !current || current.status === "fallito" || current.status === "inPausa" ? (
          <Button
            variant="primary"
            onClick={() =>
              void start(modelId, variantId, false).catch((err: unknown) =>
                setLocalError(err instanceof Error ? err.message : "Non parto."),
              )
            }
          >
            {current?.status === "inPausa" ? "Riprendi" : "Scarica"}
          </Button>
        ) : null}
        {isActive(current) && current && (
          <Button variant="ghost" onClick={() => void cancel(current.id)}>
            Annulla
          </Button>
        )}
        {installed && !isActive(current) && (
          <Button
            variant="danger"
            onClick={() => {
              const copy = removeCopy(modelName);
              void feedback
                .confirm({ ...copy, danger: true, confirmLabel: "Elimina" })
                .then((ok) => {
                  if (ok) void library.forget(variantId);
                });
            }}
          >
            Elimina
          </Button>
        )}
        {current && current.status !== "pronto" && (
          <Button variant="ghost" onClick={() => onNavigate("downloads")}>
            Vedi
          </Button>
        )}
      </div>
      {(current || installed) && (
        <p className="model-meta">
          {installed?.status === "pronto"
            ? installed.active
              ? "Sul disco · in uso"
              : "Sul disco"
            : current
              ? `${current.statusLabel}${
                  current.status === "inCorso" ||
                  current.status === "inPausa" ||
                  current.status === "controllo"
                    ? ` · ${formatProgress(jobBarBytes(current), current.expectedBytes)}`
                    : ""
                }`
              : installed?.statusLabel}
        </p>
      )}
      {current?.status === "fallito" && <p className="model-desc">{current.message}</p>}
      {other && <p className="model-meta">Un’altra versione è in trasferimento.</p>}
      {localError && <p className="model-desc">{localError}</p>}
    </div>
  );
}

export function InstalledStrip({ onNavigate }: { onNavigate: (route: RouteId) => void }) {
  const { snapshot, error, useModel, forget } = useLibrary();
  const downloads = useDownloads();
  const feedback = useFeedback();
  if (!snapshot || snapshot.items.length === 0) return null;

  return (
    <div className="library-strip">
      <div className="library-strip-head">
        <p className="page-kicker">Sul disco</p>
        <p className="model-meta">
          {snapshot.readyCount === 0
            ? "Nessun modello pronto."
            : `${snapshot.readyCount} ${
                snapshot.readyCount === 1 ? "modello" : "modelli"
              } · ${formatSize(snapshot.totalBytes)}`}
        </p>
      </div>
      {error && <p className="model-desc">{error}</p>}
      <div className="library-chips">
        {snapshot.items.map((item) => {
          const current = downloads.job(item.variantId);
          const busy = isActive(current);
          return (
            <article key={item.variantId} className={cx("library-card", item.active && "is-live")}>
              <header className="library-card-head">
                <ModelLogo
                  seed={item.modelId}
                  source={{ id: item.modelId, name: item.modelName }}
                />
                <div className="library-card-title">
                  <h3>{item.modelName}</h3>
                  <div className="holo-row">
                    {item.active ? (
                      <HoloTag tone="lime">In uso</HoloTag>
                    ) : (
                      <HoloTag tone="cyan">Sul disco</HoloTag>
                    )}
                    <HoloTag tone="ghost" label="Peso">
                      {formatSize(item.bytes)}
                    </HoloTag>
                    {item.status !== "pronto" ? (
                      <HoloTag tone="amber">{item.statusLabel}</HoloTag>
                    ) : null}
                  </div>
                </div>
              </header>
              <div className="library-card-actions">
                {item.status === "pronto" && (
                  <Button
                    variant={item.active ? "success" : "primary"}
                    onClick={() =>
                      void useModel(item.modelId, item.variantId).then(() => onNavigate("chat"))
                    }
                  >
                    {item.active ? "Apri chat" : "Usa"}
                  </Button>
                )}
                {!busy && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      const copy = removeCopy(item.modelName);
                      void feedback
                        .confirm({ ...copy, danger: true, confirmLabel: "Elimina" })
                        .then((ok) => {
                          if (ok) void forget(item.variantId);
                        });
                    }}
                  >
                    Elimina
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
