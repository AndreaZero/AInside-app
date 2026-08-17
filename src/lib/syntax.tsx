import type { ReactNode } from "react";

const JS_KW =
  /^(const|let|var|function|return|if|else|for|while|class|import|export|from|new|await|async|type|interface|extends|implements|enum|default|void|null|undefined|true|false|this|super|of|in|as|typeof|instanceof|break|continue|switch|case|try|catch|finally|throw|yield)$/;

const PY_KW =
  /^(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|None|True|False|and|or|not|in|is|lambda|yield|async|await|global|nonlocal)$/;

const RS_KW =
  /^(fn|let|mut|const|pub|struct|enum|impl|trait|use|mod|crate|self|Self|return|if|else|match|for|while|loop|break|continue|async|await|type|where|as|in|ref|move|dyn|true|false)$/;

const SH_KW = /^(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|export|local|source)$/;

const SQL_KW =
  /^(SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|ON|AS|ORDER|BY|GROUP|LIMIT|OFFSET|NOT|NULL|IS)$/i;

function family(lang: string | null): string {
  const kind = (lang ?? "").toLowerCase();
  if (["html", "htm", "xml", "svg", "vue", "svelte"].includes(kind)) return "html";
  if (["css", "scss", "less"].includes(kind)) return "css";
  if (["js", "javascript", "ts", "tsx", "jsx", "mjs", "cjs"].includes(kind)) return "js";
  if (["json", "jsonc"].includes(kind)) return "json";
  if (kind === "py" || kind === "python") return "py";
  if (kind === "rs" || kind === "rust") return "rs";
  if (["sh", "bash", "zsh", "ps1", "env"].includes(kind)) return "sh";
  if (["yml", "yaml"].includes(kind)) return "yaml";
  if (kind === "toml") return "toml";
  if (kind === "sql") return "sql";
  if (["c", "h", "cpp", "hpp", "cc", "cs", "java", "kt", "php", "go", "rb"].includes(kind)) {
    return "c";
  }
  return "";
}

function pattern(familyName: string, lang: string | null): RegExp | null {
  const kind = (lang ?? "").toLowerCase();
  switch (familyName) {
    case "html":
      return /(<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*|\/?>|"[^"]*"|'[^']*')/g;
    case "css":
      return /(\/\*[\s\S]*?\*\/|[a-zA-Z-]+(?=\s*:)|:[^;{}]+|#(?:[0-9a-fA-F]{3,8})|"[^"]*"|'[^']*')/g;
    case "js":
      return kind === "tsx" || kind === "jsx"
        ? /(<!--[\s\S]*?-->|\/\/.*$|\/\*[\s\S]*?\*\/|<\/?[a-zA-Z][\w:-]*|\/?>|"[^"]*"|'[^']*'|`[^`]*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|await|async|type|interface|extends|implements|enum|default|void|null|undefined|true|false|this|super|of|in|as)\b)/gm
        : /(\/\/.*$|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|`[^`]*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|await|async|type|interface|extends|implements|enum|default|void|null|undefined|true|false|this|super|of|in|as)\b)/gm;
    case "json":
      return /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    case "py":
      return /(#.*$|"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*'|\b(?:def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|None|True|False|and|or|not|in|is|lambda|yield|async|await)\b)/gm;
    case "rs":
      return /(\/\/.*$|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|\b(?:fn|let|mut|const|pub|struct|enum|impl|trait|use|mod|return|if|else|match|for|while|loop|async|await|type|true|false)\b)/gm;
    case "sh":
      return /(#.*$|"[^"]*"|'[^']*'|\b(?:if|then|else|elif|fi|for|while|do|done|case|in|function|return|export|local)\b)/gm;
    case "yaml":
      return /(#.*$|"[^"]*"|'[^']*'|[A-Za-z_][\w-]*(?=\s*:)|:\s*.+$|\b(?:true|false|null|yes|no)\b)/gm;
    case "toml":
      return /(#.*$|"[^"]*"|'[^']*'|\[[^\]]+\]|[A-Za-z_][\w-]*(?=\s*=))/gm;
    case "sql":
      return /(--.*$|"[^"]*"|'[^']*'|\b(?:SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|JOIN|ON|AS|ORDER|BY|GROUP|LIMIT|NOT|NULL)\b)/gim;
    case "c":
      return /(\/\/.*$|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|#\s*\w+|\b(?:int|void|return|if|else|for|while|class|public|private|static|const|new|true|false|null|package|func|fn|def|var|let)\b)/gm;
    default:
      return null;
  }
}

function tokenClass(token: string, familyName: string, lang: string | null): string {
  if (
    token.startsWith("<!--") ||
    token.startsWith("//") ||
    token.startsWith("/*") ||
    token.startsWith("--") ||
    (token.startsWith("#") && familyName !== "css" && familyName !== "c")
  ) {
    return "is-comment";
  }
  if (token.startsWith("<") && familyName === "html") return "is-tag";
  if ((lang === "tsx" || lang === "jsx") && token.startsWith("<")) return "is-tag";
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`") || token.startsWith("\"\"\"")) {
    return "is-str";
  }
  if (familyName === "json") {
    if (/^-?\d/.test(token) || token === "true" || token === "false" || token === "null") {
      return "is-val";
    }
    if (token.endsWith(":")) return "is-name";
    return "is-str";
  }
  if (familyName === "css" && (token.startsWith("#") || token.startsWith(":"))) return "is-val";
  if (familyName === "js" && JS_KW.test(token)) return "is-kw";
  if (familyName === "py" && PY_KW.test(token)) return "is-kw";
  if (familyName === "rs" && RS_KW.test(token)) return "is-kw";
  if (familyName === "sh" && SH_KW.test(token)) return "is-kw";
  if (familyName === "sql" && SQL_KW.test(token)) return "is-kw";
  if (familyName === "c" && /^(int|void|return|if|else|for|while|class|public|private|static|const|new|true|false|null|package|func|fn|def|var|let)$/.test(token)) {
    return "is-kw";
  }
  if (familyName === "toml" && token.startsWith("[")) return "is-tag";
  if (familyName === "yaml" && token.endsWith(":")) return "is-name";
  return "is-name";
}

export function highlight(code: string, lang: string | null): ReactNode[] {
  const fam = family(lang);
  const re = pattern(fam, lang);
  if (!re) return [code];

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(code))) {
    if (match.index > last) parts.push(code.slice(last, match.index));
    const token = match[0];
    parts.push(
      <span key={i} className={tokenClass(token, fam, lang)}>
        {token}
      </span>,
    );
    i += 1;
    last = match.index + token.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return parts;
}
