import { Button } from "../../ui/controls";
import { fileLabel, type CodePatch } from "../../lib/workspace";

export function CodePatchCard({
  patch,
  onApply,
  onUndo,
}: {
  patch: CodePatch;
  onApply?: () => void;
  onUndo?: () => void;
}) {
  const status =
    patch.status === "applied"
      ? "Scritto sul disco"
      : patch.status === "error"
        ? "Non scritto"
        : patch.status === "skipped"
          ? "Non ora"
          : "Anteprima · disco intatto";
  return (
    <article className={`code-patch is-${patch.status}`}>
      <div className="code-patch-main">
        <p className="code-patch-name">{fileLabel(patch.rel)}</p>
        <p className="code-patch-rel">{patch.rel}</p>
        <p className="code-patch-meta">
          <span className="code-patch-plus">+{patch.added ?? 0}</span>
          <span className="code-patch-minus">−{patch.removed ?? 0}</span>
          <span>{status}</span>
          {patch.created ? <span>nuovo</span> : null}
          {patch.secret ? <span>riservato</span> : null}
        </p>
        {patch.status === "pending" ? (
          <p className="code-patch-hint">I file restano com’erano finché non confermi.</p>
        ) : null}
        {patch.error ? <p className="code-patch-error">{patch.error}</p> : null}
      </div>
      {patch.status === "pending" && onApply ? (
        <Button variant="primary" onClick={onApply}>
          Applica
        </Button>
      ) : null}
      {patch.status === "applied" && onUndo ? (
        <Button onClick={onUndo}>Annulla</Button>
      ) : null}
    </article>
  );
}
