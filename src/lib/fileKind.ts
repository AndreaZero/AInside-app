export function fileExt(rel: string): string {
  const name = rel.replace(/\\/g, "/").split("/").pop() ?? rel;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

const LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "svg",
  css: "css",
  scss: "css",
  less: "css",
  json: "json",
  jsonc: "json",
  md: "md",
  mdx: "md",
  markdown: "md",
  txt: "txt",
  log: "txt",
  csv: "csv",
  tsv: "csv",
  py: "py",
  rs: "rs",
  go: "go",
  java: "java",
  kt: "java",
  c: "c",
  h: "c",
  cpp: "c",
  cc: "c",
  hpp: "c",
  cs: "cs",
  php: "php",
  rb: "rb",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  ps1: "sh",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  vue: "html",
  svelte: "html",
  env: "sh",
};

export function langFromRel(rel: string): string {
  return LANG[fileExt(rel)] ?? (fileExt(rel) || "testo");
}

export function isMarkdownRel(rel: string): boolean {
  return langFromRel(rel) === "md";
}

export function isJsonRel(rel: string): boolean {
  return langFromRel(rel) === "json";
}

export function isCsvRel(rel: string): boolean {
  return langFromRel(rel) === "csv";
}

export function isHtmlRel(rel: string): boolean {
  const lang = langFromRel(rel);
  return lang === "html" || lang === "svg";
}

export function isImageRel(rel: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "avif", "tif", "tiff"].includes(
    fileExt(rel),
  );
}

export function prettyJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`;
  } catch {
    return null;
  }
}

export function parseTable(text: string): string[][] | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2 || lines.length > 120) return null;
  const delim = text.includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const rows = lines.map((line) => line.split(delim).map((cell) => cell.trim()));
  const cols = rows[0]?.length ?? 0;
  if (cols < 2 || cols > 16) return null;
  if (rows.some((row) => row.length !== cols)) return null;
  return rows;
}
