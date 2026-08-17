import { useEffect, useMemo, useState } from "react";
import { cx } from "../../lib/cx";
import {
  isCsvRel,
  isHtmlRel,
  isJsonRel,
  isMarkdownRel,
  langFromRel,
  parseTable,
  prettyJson,
} from "../../lib/fileKind";
import { highlight } from "../../lib/syntax";
import { htmlSnippetDoc } from "../../lib/webPreview";
import { fileLabel, type WorkspaceFile } from "../../lib/workspace";
import { Button } from "../../ui/controls";
import { IconClose, IconCopy, IconEye } from "../../ui/icons";
import { Markdown } from "../chat/Markdown";
import { usePreview } from "../chat/PreviewPane";

export function CodePreview({
  file,
  error,
  onClose,
}: {
  file: WorkspaceFile | null;
  error: string | null;
  onClose: () => void;
}) {
  const preview = usePreview();
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    setRaw(false);
    setCopied(false);
  }, [file?.rel]);
  const lang = file ? langFromRel(file.rel) : "";
  const image = file?.kind === "image";
  const markdown = Boolean(file && isMarkdownRel(file.rel));
  const svg = Boolean(file && image && file.mime === "image/svg+xml" && file.text);
  const html = Boolean(file && isHtmlRel(file.rel) && file.kind !== "image");
  const json = Boolean(file && isJsonRel(file.rel));
  const csv = Boolean(file && isCsvRel(file.rel));
  const formattedJson = useMemo(
    () => (file && json ? prettyJson(file.text) : null),
    [file, json],
  );
  const table = useMemo(
    () => (file && csv ? parseTable(file.text) : null),
    [file, csv],
  );
  const showImage = image && Boolean(file?.dataUrl) && !(svg && raw);
  const showMarkdown = markdown && !raw && Boolean(file?.text);
  const source = formattedJson && !raw ? formattedJson : (file?.text ?? "");
  const jsonPretty =
    Boolean(formattedJson && file && formattedJson.trim() !== file.text.trim());

  async function copy() {
    if (!file?.text && !formattedJson) return;
    try {
      await navigator.clipboard.writeText(file?.text ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-preview">
      <header className="code-preview-head">
        <div className="code-preview-meta">
          <p className="code-preview-title">{file ? fileLabel(file.rel) : "File"}</p>
          {file ? (
            <p className="code-preview-rel">
              {file.rel}
              {lang ? ` · ${lang}` : ""}
            </p>
          ) : null}
        </div>
        <div className="code-preview-ops">
          {markdown || svg || jsonPretty || table ? (
            <Button variant="ghost" aria-pressed={raw} onClick={() => setRaw((value) => !value)}>
              {raw ? "Vista" : "Codice"}
            </Button>
          ) : null}
          {html && preview ? (
            <Button
              variant="ghost"
              onClick={() => preview.show(htmlSnippetDoc(file?.text ?? "", lang))}
            >
              <IconEye size={14} />
              Anteprima
            </Button>
          ) : null}
          {file?.text ? (
            <Button variant="ghost" onClick={() => void copy()}>
              <IconCopy size={14} />
              {copied ? "Copiato" : "Copia"}
            </Button>
          ) : null}
          <Button variant="icon" aria-label="Chiudi anteprima" onClick={onClose}>
            <IconClose size={14} />
          </Button>
        </div>
      </header>
      {error ? <p className="code-preview-error">{error}</p> : null}
      {file?.truncated && !image ? (
        <p className="code-preview-note">Mostro l’inizio del file (64 KB).</p>
      ) : null}
      {jsonPretty && !raw ? (
        <p className="code-preview-note">JSON sistemato per la lettura.</p>
      ) : null}
      {error ? null : file ? (
        <div className="code-preview-pane">
          {showImage && file.dataUrl ? (
            <ImageView key={file.rel} src={file.dataUrl} alt={fileLabel(file.rel)} />
          ) : showMarkdown ? (
            <div className="code-preview-md">
              <Markdown text={file.text} />
            </div>
          ) : table && !raw ? (
            <div className="code-preview-table-wrap">
              <table className="code-preview-table">
                <thead>
                  <tr>
                    {table[0].map((cell, index) => (
                      <th key={index}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.slice(1).map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : file.text ? (
            <SourceView code={source} lang={lang === "txt" || lang === "csv" ? null : lang} />
          ) : image && !file.dataUrl ? (
            <p className="code-preview-note">Questa immagine è troppo grande da mostrare qui.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ImageView({ src, alt }: { src: string; alt: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState(true);
  const tiny = Boolean(size && size.w > 0 && size.h > 0 && size.w <= 128 && size.h <= 128);
  const scale = tiny && size ? Math.max(2, Math.min(8, Math.floor(192 / Math.max(size.w, size.h)))) : 1;

  return (
    <div className={cx("code-preview-image", tiny ? "is-icon" : fit ? "is-fit" : "is-real")}>
      <div className="code-preview-image-stage">
        <img
          src={src}
          alt={alt}
          className={cx(tiny && "is-pixel")}
          style={
            tiny && size
              ? { width: size.w * scale, height: size.h * scale }
              : undefined
          }
          onLoad={(event) => {
            const el = event.currentTarget;
            setSize({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
      </div>
      {size ? (
        <p className="code-preview-image-meta">
          <span>
            {size.w} × {size.h} px
            {tiny ? ` · ×${scale}` : ""}
          </span>
          {!tiny ? (
            <button type="button" onClick={() => setFit((value) => !value)}>
              {fit ? "Dimensione reale" : "Adatta alla finestra"}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function SourceView({ code, lang }: { code: string; lang: string | null }) {
  const lines = code.split("\n");
  return (
    <div className="code-preview-source" role="region" aria-label="Contenuto del file" tabIndex={0}>
      <div className="code-gutter" aria-hidden>
        {lines.map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      <pre className="code-preview-code">
        <code>
          {lines.map((line, index) => (
            <span key={index} className="code-line">
              {line ? highlight(line, lang) : "\u00a0"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
