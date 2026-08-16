export type MdInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "br" }
  | { t: "strong"; c: MdInline[] }
  | { t: "em"; c: MdInline[] }
  | { t: "strike"; c: MdInline[] }
  | { t: "link"; href: string; c: MdInline[] };

export type MdListItem = { c: MdInline[] };

export type MdBlock =
  | { t: "p"; lines: MdInline[][] }
  | { t: "h"; l: 1 | 2 | 3; c: MdInline[] }
  | { t: "code"; lang: string | null; v: string }
  | { t: "ul"; items: MdListItem[] }
  | { t: "ol"; start: number; items: MdListItem[] }
  | { t: "quote"; lines: MdInline[][] }
  | { t: "hr" }
  | { t: "table"; head: MdInline[][]; body: MdInline[][][] };

type FenceChunk =
  | { kind: "text"; text: string }
  | { kind: "code"; lang: string | null; text: string };

function splitFences(src: string): FenceChunk[] {
  const chunks: FenceChunk[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)[ \t]*\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(src))) {
    if (match.index > last) {
      chunks.push({ kind: "text", text: src.slice(last, match.index) });
    }
    chunks.push({
      kind: "code",
      lang: match[1] || null,
      text: match[2].replace(/\n$/, ""),
    });
    last = match.index + match[0].length;
  }

  const rest = src.slice(last);
  const open = /^```([a-zA-Z0-9_+-]*)[ \t]*\n?([\s\S]*)$/.exec(rest);
  if (open) {
    chunks.push({ kind: "code", lang: open[1] || null, text: open[2] });
  } else if (rest) {
    chunks.push({ kind: "text", text: rest });
  }

  return chunks.length > 0 ? chunks : [{ kind: "text", text: src }];
}

export function parseInline(input: string): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };

  while (i < input.length) {
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (input.startsWith("***", i) || input.startsWith("___", i)) {
      const mark = input.slice(i, i + 3);
      const end = input.indexOf(mark, i + 3);
      if (end > i + 3) {
        flush();
        out.push({
          t: "strong",
          c: [{ t: "em", c: parseInline(input.slice(i + 3, end)) }],
        });
        i = end + 3;
        continue;
      }
    }

    if (input.startsWith("**", i) || input.startsWith("__", i)) {
      const mark = input.slice(i, i + 2);
      const end = input.indexOf(mark, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (input.startsWith("~~", i)) {
      const end = input.indexOf("~~", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strike", c: parseInline(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (input[i] === "*" || input[i] === "_") {
      const mark = input[i];
      const prev = i > 0 ? input[i - 1] : "";
      const next = input[i + 1] ?? "";
      const wordBefore = mark === "_" && /\w/.test(prev);
      if (!wordBefore && next && next !== " " && next !== mark) {
        let end = i + 1;
        while (end < input.length) {
          if (input[end] === mark && input[end - 1] !== " ") break;
          end++;
        }
        if (end < input.length && end > i + 1) {
          flush();
          out.push({ t: "em", c: parseInline(input.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }

    if (input[i] === "[") {
      const close = input.indexOf("]", i + 1);
      if (close !== -1 && input[close + 1] === "(") {
        const endParen = input.indexOf(")", close + 2);
        if (endParen !== -1) {
          flush();
          out.push({
            t: "link",
            href: input.slice(close + 2, endParen).trim(),
            c: parseInline(input.slice(i + 1, close)),
          });
          i = endParen + 1;
          continue;
        }
      }
    }

    buf += input[i];
    i += 1;
  }

  flush();
  return out;
}

const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}(\d+)\.\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const HR = /^(\*\*\*|---|___)\s*$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function isListLine(line: string): boolean {
  return UL.test(line) || OL.test(line);
}

function isBlockStart(line: string): boolean {
  return (
    HEADING.test(line) ||
    HR.test(line.trim()) ||
    QUOTE.test(line) ||
    isListLine(line)
  );
}

function splitRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && Boolean(lines[i + 1] && TABLE_SEP.test(lines[i + 1]));
}

function readList(lines: string[], start: number): { block: MdBlock; next: number } {
  const ordered = OL.test(lines[start]);
  const startNum = ordered ? Number(lines[start].match(/(\d+)/)?.[1] ?? 1) : 1;
  const items: MdListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const ul = UL.exec(lines[i]);
    const ol = OL.exec(lines[i]);
    const hit = ordered ? ol : ul;
    if (!hit) break;
    const body = ordered ? ol![2] : ul![1];
    const parts = [body];
    i += 1;
    while (
      i < lines.length &&
      /^\s{2,}\S/.test(lines[i]) &&
      !isListLine(lines[i])
    ) {
      parts.push(lines[i].trim());
      i += 1;
    }
    items.push({ c: parseInline(parts.join(" ")) });
  }

  return {
    block: ordered
      ? { t: "ol", start: startNum, items }
      : { t: "ul", items },
    next: i,
  };
}

function readTable(lines: string[], start: number): { block: MdBlock; next: number } {
  const head = splitRow(lines[start]).map(parseInline);
  let i = start + 2;
  const body: MdInline[][][] = [];
  while (i < lines.length && lines[i].includes("|") && !TABLE_SEP.test(lines[i])) {
    body.push(splitRow(lines[i]).map(parseInline));
    i += 1;
  }
  return { block: { t: "table", head, body }, next: i };
}

function parseBlocks(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ t: "h", l: level, c: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (HR.test(line.trim())) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])?.[1] ?? "");
        i += 1;
      }
      blocks.push({ t: "quote", lines: quoted.map(parseInline) });
      continue;
    }

    if (isListLine(line)) {
      const read = readList(lines, i);
      blocks.push(read.block);
      i = read.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const read = readTable(lines, i);
      blocks.push(read.block);
      i = read.next;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ t: "p", lines: para.map(parseInline) });
  }

  return blocks;
}

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const chunk of splitFences(src)) {
    if (chunk.kind === "code") {
      blocks.push({ t: "code", lang: chunk.lang, v: chunk.text });
    } else {
      blocks.push(...parseBlocks(chunk.text));
    }
  }
  return blocks;
}
