import { useState } from "react";
import { htmlSnippetDoc, isWebLang, looksLikeHtml } from "../../lib/webPreview";
import { highlight } from "../../lib/syntax";
import { Button } from "../../ui/controls";
import { IconCopy, IconEye } from "../../ui/icons";
import { usePreview } from "./PreviewPane";

export function CodeBlock({
  lang,
  code,
}: {
  lang: string | null;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const preview = usePreview();
  const web = Boolean(lang && isWebLang(lang)) || looksLikeHtml(code);
  const label = lang || "codice";

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className="msg-code-wrap">
      <header className="msg-code-bar">
        <span className="msg-code-lang">{label}</span>
        <div className="msg-code-ops">
          {web && preview ? (
            <Button
              variant="ghost"
              aria-pressed={preview.open}
              onClick={() =>
                preview.show(preview.doc ? undefined : htmlSnippetDoc(code, lang))
              }
            >
              <IconEye size={14} />
              Anteprima
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => void copy()}>
            <IconCopy size={14} />
            {copied ? "Copiato" : "Copia"}
          </Button>
        </div>
      </header>
      <pre className="msg-code">
        <code>{highlight(code, lang)}</code>
      </pre>
    </figure>
  );
}
