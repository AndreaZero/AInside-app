import { cx } from "../lib/cx";

export function CircularGauge({
  value,
  label,
  title,
  tone = "cyan",
}: {
  value: number;
  label: string;
  title: string;
  tone?: "cyan" | "success" | "warning";
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const dash = circ * clamped;

  return (
    <div className={cx("gauge", `gauge--${tone}`)}>
      <svg viewBox="0 0 140 140" className="gauge-svg" aria-hidden>
        <circle className="gauge-track" cx="70" cy="70" r={radius} />
        <circle
          className="gauge-arc"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="gauge-copy">
        <p className="gauge-title">{title}</p>
        <p className="gauge-label">{label}</p>
      </div>
    </div>
  );
}
