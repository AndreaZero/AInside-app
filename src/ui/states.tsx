import type { ReactNode } from "react";
import { useState } from "react";
import { cx } from "../lib/cx";
import { Button } from "./controls";

export function Skeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cx("skel-stack", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cx("skel", i === 0 && "skel--title", i === lines - 1 && "skel--short")} />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="skel-card" aria-hidden>
      <div className="skel skel--icon" />
      <div className="skel-stack">
        <div className="skel skel--title" />
        <div className="skel" />
        <div className="skel skel--short" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  visual,
  action,
}: {
  title: string;
  description: string;
  visual?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {visual ? <div className="empty-visual">{visual}</div> : null}
      <h2 className="empty-title">{title}</h2>
      <p className="empty-copy">{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  detail,
  action,
}: {
  title: string;
  description: string;
  detail?: string | null;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="error-box">
      <h2 className="error-title">{title}</h2>
      <p className="error-copy">{description}</p>
      {action}
      {detail ? (
        <>
          <Button
            variant="ghost"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Nascondi dettagli tecnici" : "Mostra dettagli tecnici"}
          </Button>
          {open ? <pre className="error-detail">{detail}</pre> : null}
        </>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  tone = "warning",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  return <div className={cx("inline-alert", `is-${tone}`)}>{children}</div>;
}
