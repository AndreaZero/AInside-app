import { Button } from "../../ui/controls";
import { IconClose } from "../../ui/icons";
import { fileLabel, type WorkspaceFile } from "../../lib/workspace";

export function CodePreview({
  file,
  error,
  onClose,
}: {
  file: WorkspaceFile | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="code-preview">
      <header className="code-preview-head">
        <div>
          <p className="code-preview-title">{file ? fileLabel(file.rel) : "File"}</p>
          {file ? <p className="code-preview-rel">{file.rel}</p> : null}
        </div>
        <Button variant="icon" aria-label="Chiudi anteprima" onClick={onClose}>
          <IconClose size={14} />
        </Button>
      </header>
      {error ? (
        <p className="code-preview-error">{error}</p>
      ) : file ? (
        <>
          {file.truncated ? (
            <p className="code-preview-note">Mostro l’inizio del file (64 KB).</p>
          ) : null}
          <pre className="code-preview-body">
            <code>{file.text}</code>
          </pre>
        </>
      ) : null}
    </div>
  );
}
