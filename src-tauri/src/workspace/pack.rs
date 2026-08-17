use super::{flatten_files, read_rel, workspace_tree};

pub fn coding_system(model_name: Option<&str>, thinking: bool) -> String {
    let name = model_name
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("un modello locale");
    let think = if thinking {
        " Pensa poco, poi rispondi."
    } else {
        ""
    };
    format!(
        "Sei {name}. Lavori solo nella cartella aperta. Non inventare file che non hai letto. Se ti manca un file, una riga sola: LEGGI: percorso/relativo\nPer modificare, non dire che hai già scritto sul disco. Usa:\n*** File: percorso\n<<<\npezzo vecchio esatto\n>>>\npezzo nuovo{think}"
    )
}

pub fn mentions_in(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'@'
            && (i == 0 || bytes[i - 1].is_ascii_whitespace())
        {
            let rest = &text[i + 1..];
            let end = rest
                .find(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == ')' || c == ']')
                .unwrap_or(rest.len());
            let raw = rest[..end].trim_matches(|c: char| matches!(c, '.' | ':' | '`' | '"' | '\''));
            if looks_like_path(raw) {
                let rel = normalize_cite(raw);
                if !rel.is_empty() && !out.iter().any(|old| old == &rel) {
                    out.push(rel);
                }
            }
            i += 1 + end;
            continue;
        }
        i += 1;
    }
    out
}

pub fn leggi_paths(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        if let Some(rel) = parse_leggi_line(line) {
            if !out.iter().any(|old| old == &rel) {
                out.push(rel);
            }
        }
    }
    out
}

pub fn strip_leggi_lines(text: &str) -> String {
    text.lines()
        .filter(|line| parse_leggi_line(line).is_none())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn build_pack(root: &str, cited: &[String], budget_chars: usize) -> String {
    let mut parts = Vec::new();
    if let Ok(tree) = workspace_tree(root.to_string()) {
        let mut files = Vec::new();
        flatten_files(&tree.nodes, &mut files);
        if !files.is_empty() {
            let max = 180.min(files.len());
            let mut list = String::from("File nel progetto:\n");
            for rel in files.iter().take(max) {
                list.push_str("- ");
                list.push_str(rel);
                list.push('\n');
            }
            if files.len() > max || tree.truncated {
                list.push_str("- …\n");
            }
            parts.push(list);
        }
    }

    let mut used: Vec<String> = Vec::new();
    let mut packed = String::new();
    for rel in cited {
        let rel = normalize_cite(rel);
        if rel.is_empty() || used.iter().any(|old| old == &rel) {
            continue;
        }
        match read_rel(root, &rel) {
            Ok(file) => {
                let mut block = format!("### {}\n```\n{}\n```\n", file.rel, file.text);
                if file.truncated {
                    block.push_str("(inizio del file)\n");
                }
                if packed.len() + block.len() + parts.iter().map(String::len).sum::<usize>()
                    > budget_chars
                    && !packed.is_empty()
                {
                    break;
                }
                packed.push_str(&block);
                used.push(rel);
            }
            Err(err) => {
                packed.push_str(&format!("### {rel}\n({err})\n"));
                used.push(rel);
            }
        }
    }
    if !packed.is_empty() {
        parts.push(format!("Contenuto dei file citati:\n{packed}"));
    }
    parts.join("\n")
}

pub fn with_pack(last_user: &str, pack: &str) -> String {
    if pack.trim().is_empty() {
        return last_user.to_string();
    }
    format!("{pack}\n---\n{last_user}")
}

fn parse_leggi_line(line: &str) -> Option<String> {
    let trimmed = line.trim().trim_start_matches(['-', '*', '•']).trim();
    let lower = trimmed.to_ascii_lowercase();
    let rest = lower.strip_prefix("leggi:")?;
    let original = trimmed.get((trimmed.len() - rest.len())..)?;
    let rel = original
        .trim()
        .trim_matches(|c: char| matches!(c, '`' | '"' | '\'' | '.'));
    let rel = normalize_cite(rel);
    looks_like_path(&rel).then_some(rel)
}

fn looks_like_path(text: &str) -> bool {
    if text.is_empty() || text.len() > 240 {
        return false;
    }
    if text.contains("://") || text.contains('@') {
        return false;
    }
    text.contains('/') || text.contains('\\') || text.contains('.')
}

fn normalize_cite(rel: &str) -> String {
    rel.trim()
        .trim_start_matches("./")
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_mentions() {
        let found = mentions_in("guarda @src/app.ts e @README.md per favore");
        assert_eq!(found, vec!["src/app.ts", "README.md"]);
    }

    #[test]
    fn finds_leggi_lines() {
        let text = "Mi serve il file\nLEGGI: src/lib/chat.ts\nLEGGI: `src/main.rs`\n";
        assert_eq!(leggi_paths(text), vec!["src/lib/chat.ts", "src/main.rs"]);
        assert!(!strip_leggi_lines(text).contains("LEGGI:"));
    }

    #[test]
    fn skips_email_like_mentions() {
        assert!(mentions_in("scrivi a foo@bar.com").is_empty());
    }
}
