import { useState, type ReactNode } from "react";
import { htmlSnippetDoc, isWebLang, looksLikeHtml } from "../../lib/webPreview";
import { Button } from "../../ui/controls";
import { IconCopy, IconEye } from "../../ui/icons";
import { usePreview } from "./PreviewPane";

function tokenize(code: string, lang: string | null): ReactNode[] {
  const kind = (lang ?? "").toLowerCase();
  const pattern =
    kind === "html" || kind === "htm" || kind === "svg" || kind === "xml"
      ? /(<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*|\/?>|"[^"]*"|'[^']*')/g
      : kind === "css"
        ? /(\/\*[\s\S]*?\*\/|[a-zA-Z-]+(?=\s*:)|:[^;{}]+|#(?:[0-9a-fA-F]{3,8})|"[^"]*"|'[^']*')/g
        : kind === "js" ||
            kind === "javascript" ||
            kind === "ts" ||
            kind === "jsx" ||
            kind === "tsx"
          ? /(\/\/.*$|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|`[^`]*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|await|async)\b)/gm
          : null;
  if (!pattern) return [code];

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(code))) {
    if (match.index > last) parts.push(code.slice(last, match.index));
    const token = match[0];
    const cls =
      token.startsWith("<!--") || token.startsWith("//") || token.startsWith("/*")
        ? "is-comment"
        : token.startsWith("<")
          ? "is-tag"
          : token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")
            ? "is-str"
            : /^(const|let|var|function|return|if|else|for|while|class|import|export|from|new|await|async)$/.test(
                token,
              )
              ? "is-kw"
              : token.startsWith("#") || token.startsWith(":")
                ? "is-val"
                : "is-name";
    parts.push(
      <span key={i} className={cls}>
        {token}
      </span>,
    );
    i += 1;
    last = match.index + token.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return parts;
}

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
        <code>{tokenize(code, lang)}</code>
      </pre>
    </figure>
  );
}
