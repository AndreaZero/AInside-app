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
        "Sei {name}. Agente codice nella cartella aperta. Italiano, breve.\nNon copiare file interi in chat. Non dire che hai già scritto: AInside tocca il disco solo dopo il permesso.\nSe ti manca un file, una riga e basta:\nLEGGI: percorso/relativo\nPer modificare, copia il pezzo vecchio identico dal file letto (stessi spazi):\n*** File: percorso\n<<<\npezzo vecchio esatto\n>>>\npezzo nuovo\nUna frase, poi i blocchi. Niente markdown ``` intorno alle modifiche.{think}"
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

pub fn clip_utf8(text: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if text.len() <= max {
        return text.to_string();
    }
    let ell = '…'.len_utf8();
    if max <= ell {
        return "…".into();
    }
    let mut end = max.saturating_sub(ell).min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    if end == 0 {
        return "…".into();
    }
    let mut out = text[..end].trim_end().to_string();
    out.push('…');
    out
}

fn file_block(rel: &str, text: &str, truncated: bool) -> String {
    let mut block = format!("### {rel}\n```\n{text}\n```\n");
    if truncated {
        block.push_str("(inizio del file)\n");
    }
    block
}

pub fn build_pack(root: &str, cited: &[String], budget_chars: usize) -> String {
    if budget_chars < 24 {
        return String::new();
    }
    let mut parts = Vec::new();
    let tree_budget = (budget_chars / 3).min(budget_chars.saturating_sub(24));
    if let Ok(tree) = workspace_tree(root.to_string()) {
        let mut files = Vec::new();
        flatten_files(&tree.nodes, &mut files);
        if let Some(list) = tree_list(&files, tree.truncated, tree_budget) {
            parts.push(list);
        }
    }

    let header = "Contenuto dei file citati:\n";
    let mut used: usize = parts.iter().map(String::len).sum();
    let mut packed = String::new();
    let mut seen: Vec<String> = Vec::new();
    for rel in cited {
        let rel = normalize_cite(rel);
        if rel.is_empty() || seen.iter().any(|old| old == &rel) {
            continue;
        }
        let room = budget_chars
            .saturating_sub(used)
            .saturating_sub(header.len())
            .saturating_sub(packed.len());
        if room < 40 {
            break;
        }
        match read_rel(root, &rel) {
            Ok(file) => {
                let (block, ok) = fit_file_block(&file.rel, &file.text, file.truncated, room);
                if !ok {
                    break;
                }
                packed.push_str(&block);
                seen.push(rel);
            }
            Err(err) => {
                let line = format!("### {rel}\n({err})\n");
                if line.len() > room && !packed.is_empty() {
                    break;
                }
                packed.push_str(&clip_utf8(&line, room));
                seen.push(rel);
            }
        }
    }
    if !packed.is_empty() {
        parts.push(format!("{header}{packed}"));
    }
    let out = parts.join("\n");
    if out.len() > budget_chars {
        clip_utf8(&out, budget_chars)
    } else {
        out
    }
}

fn tree_list(files: &[String], truncated: bool, budget: usize) -> Option<String> {
    if files.is_empty() || budget < 20 {
        return None;
    }
    let mut list = String::from("File nel progetto:\n");
    let mut n = 0usize;
    let more = "- …\n";
    for rel in files {
        let line = format!("- {rel}\n");
        let need_more = n + 1 < files.len() || truncated;
        let extra = if need_more { more.len() } else { 0 };
        if list.len() + line.len() + extra > budget {
            break;
        }
        list.push_str(&line);
        n += 1;
        if n >= 80 {
            break;
        }
    }
    if n == 0 {
        return None;
    }
    if (n < files.len() || truncated) && list.len() + more.len() <= budget {
        list.push_str(more);
    }
    Some(list)
}

pub fn fit_file_block(rel: &str, text: &str, truncated: bool, room: usize) -> (String, bool) {
    let full = file_block(rel, text, truncated);
    if full.len() <= room {
        return (full, true);
    }
    let wrap = file_block(rel, "", true).len() + 8;
    let keep = room.saturating_sub(wrap);
    if keep < 24 {
        return (String::new(), false);
    }
    (file_block(rel, &clip_utf8(text, keep), true), true)
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

    #[test]
    fn clip_utf8_does_not_split_ellipsis() {
        let text = "Ho letto il file… ecco.";
        let out = clip_utf8(text, 20);
        assert!(out.is_char_boundary(out.len()));
        assert!(!out.contains('\u{FFFD}'));
    }

    #[test]
    fn tree_list_stays_in_budget() {
        let files: Vec<String> = (0..200).map(|i| format!("src/file-{i}.ts")).collect();
        let list = tree_list(&files, false, 120).unwrap();
        assert!(list.len() <= 120);
        assert!(list.contains('…'));
    }

    #[test]
    fn file_block_truncates_to_room() {
        let body = "a".repeat(4000);
        let (block, ok) = fit_file_block("src/app.ts", &body, false, 200);
        assert!(ok);
        assert!(block.len() <= 200);
        assert!(block.contains("src/app.ts"));
        assert!(block.contains("(inizio del file)"));
    }
}
