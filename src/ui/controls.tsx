import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "danger" | "icon";

export function Button({
  variant = "secondary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button type="button" className={cx("ui-btn", `ui-btn--${variant}`, className)} {...props}>
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx("ui-toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle-knob" />
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "cyan";
  className?: string;
}) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`, className)}>{children}</span>;
}

export type StatusKind =
  | "locale"
  | "pronto"
  | "run"
  | "download"
  | "verify"
  | "error"
  | "recommended"
  | "incompatible"
  | "light"
  | "quality"
  | "paused";

const STATUS_TONE: Record<StatusKind, string> = {
  locale: "cyan",
  pronto: "success",
  run: "accent",
  download: "accent",
  verify: "warning",
  error: "danger",
  recommended: "success",
  incompatible: "danger",
  light: "cyan",
  quality: "accent",
  paused: "warning",
};

const STATUS_LABEL: Record<StatusKind, string> = {
  locale: "Locale",
  pronto: "Pronto",
  run: "In esecuzione",
  download: "Download",
  verify: "Verifica",
  error: "Errore",
  recommended: "Consigliato",
  incompatible: "Non compatibile",
  light: "Leggero",
  quality: "Qualità alta",
  paused: "In pausa",
};

export function StatusBadge({
  kind,
  children,
}: {
  kind: StatusKind;
  children?: ReactNode;
}) {
  return <Badge tone={STATUS_TONE[kind] as "neutral"}>{children ?? STATUS_LABEL[kind]}</Badge>;
}

export function ProgressBar({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: "accent" | "success" | "warning" | "danger" | "cyan";
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("ui-progress", className)} role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <span className={cx("ui-progress-fill", `is-${tone}`)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Meter({
  value,
  label,
  display,
  tone = "accent",
}: {
  value: number;
  label: string;
  display?: string;
  tone?: "accent" | "success" | "warning" | "cyan";
}) {
  return (
    <div className="ui-meter">
      <div className="ui-meter-row">
        <span>{label}</span>
        {display ? <span>{display}</span> : null}
      </div>
      <ProgressBar value={value * 100} tone={tone} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="ui-spinner" role="status" aria-label={label ?? "Caricamento"}>
      <span className="ui-spinner-ring" />
    </span>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cx("ui-tab", value === item.id && "is-active")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
