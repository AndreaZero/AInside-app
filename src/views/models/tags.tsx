import type { ReactNode } from "react";
import type { FitLevel, SpeedHint } from "../../lib/catalog";
import { cx } from "../../lib/cx";

export type HoloTone =
  | "cyan"
  | "blue"
  | "purple"
  | "magenta"
  | "lime"
  | "amber"
  | "rose"
  | "ghost";

export function HoloTag({
  tone,
  label,
  children,
}: {
  tone: HoloTone;
  label?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx("holo-tag", `holo-tag--${tone}`)}>
      {label ? <em>{label}</em> : null}
      {children}
    </span>
  );
}

export const CATEGORY_TONE: Record<string, HoloTone> = {
  generale: "blue",
  programmazione: "cyan",
  scrittura: "purple",
  ragionamento: "magenta",
  leggeri: "lime",
  visione: "rose",
};

export function speedTone(speed: SpeedHint): HoloTone {
  if (speed === "veloce") return "lime";
  if (speed === "buona") return "cyan";
  return "amber";
}

export function weightTone(bytes: number): HoloTone {
  if (bytes < 3 * 1024 ** 3) return "lime";
  if (bytes < 8 * 1024 ** 3) return "cyan";
  return "purple";
}

export function fitTone(fit: FitLevel): HoloTone {
  if (fit === "comodo") return "lime";
  if (fit === "ok") return "cyan";
  return "amber";
}
