import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/cx";
import { Button } from "./controls";
import { IconCheck, IconClose, IconInfo, IconAlert } from "./icons";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="tip">
      {children}
      <span className="tip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function Popover({
  open,
  onClose,
  align = "start",
  children,
  content,
}: {
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  children: ReactNode;
  content: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className={cx("pop", align === "end" && "pop--end")} ref={root}>
      {children}
      {open ? (
        <div className="pop-panel" role="menu">
          {content}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx("pop-item", danger && "is-danger")}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

type ToastKind = "success" | "info" | "warning" | "error";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: ToastAction;
};

type DialogRequest = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ChoiceAction = {
  id: string;
  label: string;
  variant?: "primary" | "ghost" | "danger";
};

type ChooseRequest = {
  title: string;
  description: string;
  actions: ChoiceAction[];
  cancelLabel?: string;
};

type FeedbackApi = {
  toast: (kind: ToastKind, title: string, detail?: string, action?: ToastAction) => void;
  success: (title: string, detail?: string, action?: ToastAction) => void;
  info: (title: string, detail?: string) => void;
  warning: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  confirm: (request: DialogRequest) => Promise<boolean>;
  choose: (request: ChooseRequest) => Promise<string | null>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback richiede FeedbackProvider");
  return ctx;
}

const TOAST_ICON = {
  success: IconCheck,
  info: IconInfo,
  warning: IconAlert,
  error: IconAlert,
} as const;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(DialogRequest & { resolve: (ok: boolean) => void }) | null>(
    null,
  );
  const [choice, setChoice] = useState<(ChooseRequest & { resolve: (id: string | null) => void }) | null>(
    null,
  );

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, detail?: string, action?: ToastAction) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current.slice(-3), { id, kind, title, detail, action }]);
      const ttl = action ? 8000 : kind === "error" ? 6400 : 4200;
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const confirm = useCallback((request: DialogRequest) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...request, resolve });
    });
  }, []);

  const choose = useCallback((request: ChooseRequest) => {
    return new Promise<string | null>((resolve) => {
      setChoice({ ...request, resolve });
    });
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      success: (title, detail, action) => toast("success", title, detail, action),
      info: (title, detail) => toast("info", title, detail),
      warning: (title, detail) => toast("warning", title, detail),
      error: (title, detail) => toast("error", title, detail),
      confirm,
      choose,
    }),
    [toast, confirm, choose],
  );

  function closeDialog(ok: boolean) {
    dialog?.resolve(ok);
    setDialog(null);
  }

  function closeChoice(id: string | null) {
    choice?.resolve(id);
    setChoice(null);
  }

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite">
          {toasts.map((item) => {
            const Icon = TOAST_ICON[item.kind];
            return (
              <div
                key={item.id}
                className={cx("toast", `toast--${item.kind}`, item.action && "has-action")}
              >
                <Icon size={16} />
                <div>
                  <p className="toast-title">{item.title}</p>
                  {item.detail ? <p className="toast-detail">{item.detail}</p> : null}
                </div>
                {item.action ? (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="toast-close"
                  aria-label="Chiudi"
                  onClick={() => dismiss(item.id)}
                >
                  <IconClose size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
      {dialog
        ? createPortal(
            <DialogFrame
              title={dialog.title}
              description={dialog.description}
              confirmLabel={dialog.confirmLabel ?? "Conferma"}
              cancelLabel={dialog.cancelLabel ?? "Annulla"}
              danger={dialog.danger}
              onConfirm={() => closeDialog(true)}
              onCancel={() => closeDialog(false)}
            />,
            document.body,
          )
        : null}
      {choice
        ? createPortal(
            <ChoiceFrame
              title={choice.title}
              description={choice.description}
              actions={choice.actions}
              cancelLabel={choice.cancelLabel ?? "Non ora"}
              onPick={(id) => closeChoice(id)}
              onCancel={() => closeChoice(null)}
            />,
            document.body,
          )
        : null}
    </FeedbackContext.Provider>
  );
}

function DialogFrame({
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const nodes = root?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    nodes?.[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Tab" && nodes && nodes.length > 0) {
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onCancel]);

  return (
    <div className="dialog-back" onMouseDown={onCancel}>
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <p className="dialog-copy">{description}</p>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceFrame({
  title,
  description,
  actions,
  cancelLabel,
  onPick,
  onCancel,
}: {
  title: string;
  description: string;
  actions: ChoiceAction[];
  cancelLabel: string;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const nodes = root?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    nodes?.[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onCancel]);

  return (
    <div className="dialog-back" onMouseDown={onCancel}>
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <p className="dialog-copy">{description}</p>
        <div className="dialog-actions is-stack">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? "secondary"}
              onClick={() => onPick(action.id)}
            >
              {action.label}
            </Button>
          ))}
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
