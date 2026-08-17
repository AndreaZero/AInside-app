import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "../../lib/cx";
import { Button } from "../../ui/controls";
import { IconClose, IconWindow } from "../../ui/icons";
import { Tooltip } from "../../ui/overlays";
import { WebPreview } from "./WebPreview";

type PreviewApi = {
  open: boolean;
  doc: string | null;
  live: boolean;
  show: (doc?: string) => void;
  hide: () => void;
  toggle: () => void;
};

const PreviewCtx = createContext<PreviewApi | null>(null);

export function usePreview(): PreviewApi | null {
  return useContext(PreviewCtx);
}

export function PreviewToggle() {
  const preview = usePreview();
  if (!preview) return null;
  return (
    <Tooltip label={preview.open ? "Chiudi anteprima web" : "Anteprima web"}>
      <Button
        variant="icon"
        className={cx("chat-preview-btn", preview.open && "is-on")}
        aria-pressed={preview.open}
        aria-label={preview.open ? "Chiudi anteprima web" : "Anteprima web"}
        onClick={preview.toggle}
      >
        <IconWindow size={16} />
      </Button>
    </Tooltip>
  );
}

export function PreviewHost({
  doc,
  live = false,
  resetKey,
  children,
}: {
  doc: string | null;
  live?: boolean;
  resetKey?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const dismissed = useRef(false);
  const skipUntilChange = useRef(false);
  const wasLive = useRef(false);
  const prevDoc = useRef<string | null>(doc);
  const docRef = useRef(doc);
  docRef.current = doc;
  const shown = override ?? doc;

  useEffect(() => {
    dismissed.current = false;
    skipUntilChange.current = false;
    setOverride(null);
    setOpen(Boolean(docRef.current));
    prevDoc.current = docRef.current;
  }, [resetKey]);

  useEffect(() => {
    if (live && !wasLive.current) {
      dismissed.current = false;
      skipUntilChange.current = true;
    }
    wasLive.current = live;
  }, [live]);

  useEffect(() => {
    setOverride(null);
  }, [doc]);

  useEffect(() => {
    if (!shown) return;
    if (skipUntilChange.current) {
      if (shown === prevDoc.current) return;
      skipUntilChange.current = false;
    }
    prevDoc.current = shown;
    if (!dismissed.current) setOpen(true);
  }, [shown]);

  const show = useCallback((next?: string) => {
    if (next) setOverride(next);
    dismissed.current = false;
    skipUntilChange.current = false;
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    dismissed.current = true;
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (current) {
        dismissed.current = true;
        return false;
      }
      dismissed.current = false;
      skipUntilChange.current = false;
      return true;
    });
  }, []);

  const api = useMemo<PreviewApi>(
    () => ({ open, doc: shown, live, show, hide, toggle }),
    [open, shown, live, show, hide, toggle],
  );

  const visible = open || Boolean(shown);

  return (
    <PreviewCtx.Provider value={api}>
      <div className="preview-host">
        {children}
        {visible ? (
          <aside
            className={cx("preview-dock", open ? "is-open" : "is-closed")}
            aria-label="Anteprima"
          >
            {open ? (
              <>
                <header className="preview-dock-head">
                  <span className={cx("web-preview-dot", live && "is-live")} />
                  <span className="preview-dock-title">
                    {live ? "Anteprima in diretta" : "Anteprima"}
                  </span>
                  <Button variant="icon" aria-label="Chiudi anteprima" onClick={hide}>
                    <IconClose size={14} />
                  </Button>
                </header>
                {shown ? (
                  <div className="preview-dock-body">
                    <WebPreview doc={shown} />
                  </div>
                ) : (
                  <p className="preview-dock-empty">Nessuna pagina da mostrare.</p>
                )}
              </>
            ) : (
              <button type="button" className="preview-tab" onClick={() => show()}>
                Anteprima
              </button>
            )}
          </aside>
        ) : null}
      </div>
    </PreviewCtx.Provider>
  );
}
