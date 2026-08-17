import { extractCodeFences } from "./markdown";

const HTML_LANG = new Set(["html", "htm", "xhtml", "svg"]);
const CSS_LANG = new Set(["css", "scss"]);
const JS_LANG = new Set(["js", "javascript", "ts", "typescript", "jsx", "tsx"]);

export function looksLikeHtml(text: string): boolean {
  const sample = text.trim().slice(0, 400);
  return (
    /<!doctype\s+html/i.test(sample) ||
    /<html[\s>]/i.test(sample) ||
    /<(head|body|style|div|section|header|main|nav)\b/i.test(sample)
  );
}

export function isWebLang(lang: string | null): boolean {
  if (!lang) return false;
  return HTML_LANG.has(lang) || CSS_LANG.has(lang) || JS_LANG.has(lang);
}

function inject(doc: string, css: string, js: string): string {
  let next = doc;
  if (css && !/<style[\s>]/i.test(next)) {
    if (/<\/head>/i.test(next)) {
      next = next.replace(/<\/head>/i, `<style>${css}</style></head>`);
    } else {
      next = `<style>${css}</style>${next}`;
    }
  }
  if (js && !/<script[\s>]/i.test(next)) {
    if (/<\/body>/i.test(next)) {
      next = next.replace(/<\/body>/i, `<script>${js}</script></body>`);
    } else {
      next = `${next}<script>${js}</script>`;
    }
  }
  return next;
}

export function webPreviewDoc(markdown: string): string | null {
  const fences = extractCodeFences(markdown);
  const htmlFence =
    fences.find((item) => item.lang != null && HTML_LANG.has(item.lang)) ??
    fences.find((item) => looksLikeHtml(item.text));
  const css = fences
    .filter((item) => item.lang != null && CSS_LANG.has(item.lang))
    .map((item) => item.text)
    .join("\n");
  const js = fences
    .filter((item) => item.lang != null && JS_LANG.has(item.lang))
    .map((item) => item.text)
    .join("\n");

  if (htmlFence?.text.trim()) {
    const raw = htmlFence.text.trim();
    if (/<!doctype\s+html/i.test(raw) || /<html[\s>]/i.test(raw)) {
      return inject(raw, css, js);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;min-height:100%;} ${css}</style></head><body>${raw}${js ? `<script>${js}</script>` : ""}</body></html>`;
  }

  if (css || js) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;font-family:sans-serif;} ${css}</style></head><body>${js ? `<script>${js}</script>` : ""}</body></html>`;
  }

  const trimmed = markdown.trim();
  if (looksLikeHtml(trimmed) && !trimmed.startsWith("```")) {
    return trimmed;
  }
  return null;
}

export function htmlSnippetDoc(code: string, lang: string | null): string {
  const raw = code.trim();
  const kind = (lang ?? "").toLowerCase();
  if (HTML_LANG.has(kind) || looksLikeHtml(raw)) {
    if (/<!doctype\s+html/i.test(raw) || /<html[\s>]/i.test(raw)) {
      return raw;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;min-height:100%;}</style></head><body>${raw}</body></html>`;
  }
  if (CSS_LANG.has(kind)) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;}${raw}</style></head><body></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${raw}</script></body></html>`;
}
