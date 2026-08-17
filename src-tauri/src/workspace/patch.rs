use super::ignore::{is_secret_name, looks_binary_name, skip_name};
use super::paths::{looks_like_rel, normalize_cite, resolve_write};
use super::MAX_READ;

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

const LANG_ONLY: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc", "css", "scss", "html", "md",
    "markdown", "rs", "rust", "py", "python", "go", "java", "kt", "swift", "c", "cpp", "h", "hpp",
    "cs", "rb", "php", "sh", "bash", "zsh", "ps1", "toml", "yaml", "yml", "xml", "sql", "txt",
    "text", "plaintext", "diff", "patch", "vue", "svelte", "lua", "r", "dart", "zig", "nim",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub old: String,
    pub new: String,
}

#[derive(Debug, Clone)]
pub struct RawEdit {
    pub rel: String,
    pub hunks: Vec<Hunk>,
    pub replace: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditPreview {
    pub rel: String,
    pub status: String,
    pub added: u32,
    pub removed: u32,
    pub secret: bool,
    pub created: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn parse_edits(text: &str) -> Vec<RawEdit> {
    let text = without_think(text);
    let mut files = parse_file_blocks(&text);
    if files.is_empty() {
        files = parse_fences(&text);
    }
    files
}

pub fn preview_edits(root: &str, text: &str) -> Vec<EditPreview> {
    parse_edits(text)
        .into_iter()
        .map(|edit| preview_one(root, &edit))
        .collect()
}

pub fn strip_edit_blocks(text: &str) -> String {
    let text = without_think(text);
    let lower = text.to_ascii_lowercase();
    if let Some(idx) = lower.find("*** file:") {
        return text[..idx].trim().to_string();
    }
    text.trim().to_string()
}

pub fn apply_hunks(source: &str, hunks: &[Hunk]) -> Result<String, String> {
    let crlf = source.contains("\r\n");
    let mut text = source.replace("\r\n", "\n");
    for hunk in hunks {
        let old = hunk.old.replace("\r\n", "\n");
        let new = hunk.new.replace("\r\n", "\n");
        if old.is_empty() {
            if text.trim().is_empty() {
                text = new;
                continue;
            }
            return Err("manca il pezzo vecchio".into());
        }
        if let Some(idx) = text.find(&old) {
            text.replace_range(idx..idx + old.len(), &new);
        } else {
            return Err("pezzo".into());
        }
    }
    if crlf {
        Ok(text.replace('\n', "\r\n"))
    } else {
        Ok(text)
    }
}

pub fn write_forbidden(rel: &str) -> bool {
    rel.replace('\\', "/")
        .split('/')
        .any(|part| skip_name(part))
}

pub fn secret_rel(rel: &str) -> bool {
    Path::new(rel)
        .file_name()
        .and_then(|name| name.to_str())
        .map(is_secret_name)
        .unwrap_or(false)
}

pub fn file_name(rel: &str) -> String {
    Path::new(rel)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(rel)
        .to_string()
}

fn preview_one(root: &str, edit: &RawEdit) -> EditPreview {
    let rel = normalize_cite(&edit.rel);
    let mut card = EditPreview {
        rel: rel.clone(),
        status: "error".into(),
        added: line_count(edit_new_text(edit)),
        removed: 0,
        secret: secret_rel(&rel),
        created: false,
        error: None,
    };
    if rel.is_empty() || !looks_like_rel(&rel) {
        card.error = Some("Percorso non valido.".into());
        return card;
    }
    if write_forbidden(&rel) {
        card.error = Some("Questa cartella non si tocca.".into());
        return card;
    }
    if looks_binary_name(&file_name(&rel)) {
        card.error = Some("Questo file non è testo.".into());
        return card;
    }
    let path = match resolve_write(Path::new(root), &rel) {
        Ok(path) => path,
        Err(err) => {
            card.error = Some(err);
            return card;
        }
    };
    let exists = path.is_file();
    card.created = !exists;
    if let Some(replace) = &edit.replace {
        if exists {
            match read_for_edit(&path) {
                Ok(old) => {
                    if old.len() > MAX_READ {
                        card.error = Some(format!("Non sostituisco tutto `{}`: è troppo lungo.", file_name(&rel)));
                        return card;
                    }
                    card.removed = line_count(&old);
                }
                Err(err) => {
                    card.error = Some(err);
                    return card;
                }
            }
        }
        card.added = line_count(replace);
        card.status = "pending".into();
        return card;
    }
    if !exists && edit.hunks.iter().any(|hunk| !hunk.old.trim().is_empty()) {
        card.error = Some(format!("Non c’è `{}`.", rel));
        return card;
    }
    let source = if exists {
        match read_for_edit(&path) {
            Ok(text) => text,
            Err(err) => {
                card.error = Some(err);
                return card;
            }
        }
    } else {
        String::new()
    };
    card.removed = edit.hunks.iter().map(|hunk| line_count(&hunk.old)).sum();
    card.added = edit.hunks.iter().map(|hunk| line_count(&hunk.new)).sum();
    match apply_hunks(&source, &edit.hunks) {
        Ok(_) => card.status = "pending".into(),
        Err(_) => {
            card.error = Some(format!("Non trovo quel pezzo in `{}`.", file_name(&rel)));
        }
    }
    card
}

pub fn read_for_edit(path: &Path) -> Result<String, String> {
    const MAX: u64 = 2 * 1024 * 1024;
    let meta = fs::metadata(path).map_err(|_| "Non leggo questo file.".to_string())?;
    if meta.len() > MAX {
        return Err("Questo file è troppo grande da modificare così.".into());
    }
    let bytes = fs::read(path).map_err(|_| "Non leggo questo file.".to_string())?;
    if bytes.iter().take(8192).any(|byte| *byte == 0) {
        return Err("Questo file non è testo.".into());
    }
    String::from_utf8(bytes).map_err(|_| "Questo file non è testo.".to_string())
}

fn edit_new_text(edit: &RawEdit) -> &str {
    if let Some(replace) = &edit.replace {
        return replace;
    }
    edit.hunks.last().map(|hunk| hunk.new.as_str()).unwrap_or("")
}

fn line_count(text: &str) -> u32 {
    if text.is_empty() {
        0
    } else {
        text.lines().count() as u32
    }
}

fn without_think(content: &str) -> String {
    let lower = content.to_ascii_lowercase();
    if let Some(end) = lower.rfind("</think>") {
        content[end + 8..].trim().to_string()
    } else if lower.contains("<think>") {
        String::new()
    } else {
        content.to_string()
    }
}

fn parse_file_blocks(text: &str) -> Vec<RawEdit> {
    let starts = marker_starts(text);
    let mut files: Vec<RawEdit> = Vec::new();
    for (idx, start) in starts.iter().enumerate() {
        let end = starts.get(idx + 1).copied().unwrap_or(text.len());
        let Some(parsed) = parse_one_block(&text[*start..end]) else {
            continue;
        };
        if let Some(existing) = files.iter_mut().find(|item| item.rel == parsed.rel) {
            existing.hunks.extend(parsed.hunks);
        } else {
            files.push(parsed);
        }
    }
    files
}

fn marker_starts(text: &str) -> Vec<usize> {
    let lower = text.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(rel) = lower[i..].find("*** file:") {
        out.push(i + rel);
        i += rel + 9;
    }
    out
}

fn parse_one_block(block: &str) -> Option<RawEdit> {
    let first_nl = block.find('\n').unwrap_or(block.len());
    let header = &block[..first_nl];
    let lower = header.to_ascii_lowercase();
    let at = lower.find("*** file:")?;
    let rel = normalize_cite(header[at + 9..].trim().trim_matches(|c: char| {
        matches!(c, '`' | '"' | '\'' )
    }));
    if rel.is_empty() || !looks_like_rel(&rel) {
        return None;
    }
    let body = if first_nl < block.len() {
        &block[first_nl + 1..]
    } else {
        ""
    };
    let (old, new) = split_hunk(body)?;
    Some(RawEdit {
        rel,
        hunks: vec![Hunk { old, new }],
        replace: None,
    })
}

fn split_hunk(body: &str) -> Option<(String, String)> {
    let lines: Vec<&str> = body.lines().collect();
    let mut old_at = None;
    let mut new_at = None;
    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == "<<<" && old_at.is_none() {
            old_at = Some(idx);
        } else if trimmed == ">>>" && old_at.is_some() && new_at.is_none() {
            new_at = Some(idx);
        }
    }
    let old_i = old_at?;
    let new_i = new_at?;
    if new_i <= old_i {
        return None;
    }
    Some((lines[old_i + 1..new_i].join("\n"), lines[new_i + 1..].join("\n").trim_end().to_string()))
}

fn parse_fences(text: &str) -> Vec<RawEdit> {
    let mut out = Vec::new();
    let mut i = 0;
    let bytes = text.as_bytes();
    while i < bytes.len() {
        if text[i..].starts_with("```") && (i == 0 || bytes[i - 1] == b'\n') {
            let after = i + 3;
            let rest = &text[after..];
            let nl = rest.find('\n').unwrap_or(rest.len());
            let info = rest[..nl].trim();
            let body_start = after + nl + usize::from(nl < rest.len());
            let close = text[body_start..]
                .find("\n```")
                .or_else(|| text[body_start..].find("```"));
            let Some(end_rel) = close else {
                break;
            };
            let body = &text[body_start..body_start + end_rel];
            i = body_start + end_rel + 3;
            if let Some(rel) = path_from_fence(info) {
                if !out.iter().any(|item: &RawEdit| item.rel == rel) {
                    out.push(RawEdit {
                        rel,
                        hunks: Vec::new(),
                        replace: Some(body.to_string()),
                    });
                }
            }
            continue;
        }
        i += 1;
    }
    out
}

fn path_from_fence(info: &str) -> Option<String> {
    if info.is_empty() {
        return None;
    }
    let token = info
        .split_whitespace()
        .last()?
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '`'));
    if LANG_ONLY.iter().any(|item| *item == token.to_ascii_lowercase()) {
        return None;
    }
    let rel = normalize_cite(token);
    looks_like_rel(&rel).then_some(rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hunks() {
        let text = "ok\n*** File: src/app.ts\n<<<\nconst n = 1;\n>>>\nconst n = 2;\n";
        let edits = parse_edits(text);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].rel, "src/app.ts");
        assert_eq!(edits[0].hunks[0].old, "const n = 1;");
        assert_eq!(edits[0].hunks[0].new, "const n = 2;");
        assert_eq!(strip_edit_blocks(text), "ok");
    }

    #[test]
    fn applies_hunk() {
        let out = apply_hunks("const n = 1;\n", &[Hunk {
            old: "const n = 1;".into(),
            new: "const n = 2;".into(),
        }])
        .unwrap();
        assert_eq!(out, "const n = 2;\n");
    }

    #[test]
    fn fence_needs_path() {
        let text = "```ts\nconst n = 1;\n```\n```src/app.ts\nexport const n = 2;\n```\n";
        let edits = parse_edits(text);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].rel, "src/app.ts");
        assert_eq!(edits[0].replace.as_deref(), Some("export const n = 2;"));
    }

    #[test]
    fn skips_email_and_lang() {
        assert!(parse_edits("```python\nprint(1)\n```\n").is_empty());
    }
}
