import { useDownloadPace } from "../hooks/useDownloadPace";
import { useDownloads } from "../hooks/useDownloads";
import { isActive, jobBarBytes } from "../lib/download";
import { formatEta, formatPercent, formatProgress, formatRate } from "../lib/format";
import { ProgressBar } from "../ui/controls";
import { ModelLogo } from "../visuals/ModelLogo";

export function DownloadDock({ onOpen }: { onOpen: () => void }) {
  const { jobs } = useDownloads();
  const current = jobs.find((job) => isActive(job));
  const pace = useDownloadPace(current);
  if (!current) return null;

  const barBytes = jobBarBytes(current);
  const pct = formatPercent(barBytes, current.expectedBytes);
  const tone =
    current.status === "controllo"
      ? "warning"
      : current.status === "inCorso"
        ? "accent"
        : "cyan";
  const verifying = current.status === "controllo";
  const queued = current.status === "inCoda";

  return (
    <button type="button" className="dl-dock" onClick={onOpen}>
      <div className="dl-dock-row">
        <ModelLogo
          seed={current.modelId}
          source={{ id: current.modelId, name: current.modelName }}
          size="sm"
        />
        <div className="dl-dock-copy">
          <div className="dl-dock-top">
            <p className="dl-dock-title">{current.statusLabel}</p>
            <p className="dl-dock-pct">{pct}%</p>
          </div>
          <p className="dl-dock-name">{current.modelName}</p>
        </div>
      </div>
      <ProgressBar value={pct} tone={tone} />
      <div className="dl-dock-meta">
        <span>{formatProgress(barBytes, current.expectedBytes)}</span>
        <span>
          {queued
            ? "In attesa"
            : verifying
              ? `Controllo · ${formatRate(pace.bytesPerSec ?? 0)}`
              : formatRate(pace.bytesPerSec ?? 0)}
        </span>
        {!queued ? <span>{formatEta(pace.etaSec)}</span> : null}
      </div>
    </button>
  );
}
