//! Lettura e scrittura del progetto aperto.

mod ignore;
mod pack;
mod patch;
mod paths;
pub(crate) mod write;

pub use pack::{
    build_pack, clip_utf8, coding_system, fit_file_block, leggi_paths, mentions_in, strip_leggi_lines,
    with_pack,
};
pub use write::WorkspaceHub;

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use ignore::{ignored, image_mime, is_image_name, is_secret_name, load_gitignore, looks_binary_name, skip_name};
use paths::{rel_from, resolve_inside};

const MAX_DEPTH: u32 = 8;
const MAX_NODES: usize = 700;
const MAX_READ: usize = 64 * 1024;
const MAX_IMAGE: usize = 8 * 1024 * 1024;
const MAX_SEARCH_HITS: usize = 40;
const MAX_SEARCH_FILES: usize = 500;
const MAX_SEARCH_FILE_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub name: String,
    pub rel: String,
    pub dir: bool,
    pub children: Vec<WorkspaceNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTree {
    pub nodes: Vec<WorkspaceNode>,
    pub truncated: bool,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub rel: String,
    pub text: String,
    pub truncated: bool,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHit {
    pub rel: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

pub fn flatten_files(nodes: &[WorkspaceNode], into: &mut Vec<String>) {
    for node in nodes {
        if node.dir {
            flatten_files(&node.children, into);
        } else {
            into.push(node.rel.clone());
        }
    }
}

#[tauri::command]
pub fn workspace_tree(root: String) -> Result<WorkspaceTree, String> {
    let root = resolve_inside(Path::new(&root), "")?;
    let git = load_gitignore(&root);
    let mut count = 0;
    let mut truncated = false;
    let nodes = walk_dir(&root, "", 0, &git, &mut count, &mut truncated)?;
    Ok(WorkspaceTree {
        nodes,
        truncated,
        count,
    })
}

#[tauri::command]
pub fn workspace_read(root: String, rel: String) -> Result<WorkspaceFile, String> {
    read_rel(&root, &rel)
}

pub fn read_rel(root: &str, rel: &str) -> Result<WorkspaceFile, String> {
    let root_path = resolve_inside(Path::new(&root), "")?;
    let path = resolve_inside(Path::new(&root), &rel)?;
    if path.is_dir() {
        return Err("Quella è una cartella.".into());
    }
    let name = path
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or_default();
    if is_image_name(name) {
        return read_image(&root_path, &path, name);
    }
    if looks_binary_name(name) {
        return Err("Questo file non è testo.".into());
    }
    let bytes = fs::read(&path).map_err(|_| "Non riesco a leggere questo file.".to_string())?;
    if bytes.iter().take(8192).any(|byte| *byte == 0) {
        return Err("Questo file non è testo.".into());
    }
    let truncated = bytes.len() > MAX_READ;
    let slice = if truncated { &bytes[..MAX_READ] } else { &bytes };
    let text = String::from_utf8(slice.to_vec())
        .map_err(|_| "Questo file non è testo.".to_string())?;
    Ok(text_file(rel_from(&root_path, &path), text, truncated))
}

fn text_file(rel: String, text: String, truncated: bool) -> WorkspaceFile {
    WorkspaceFile {
        rel,
        text,
        truncated,
        kind: "text".into(),
        mime: None,
        data_url: None,
    }
}

fn read_image(root: &Path, path: &Path, name: &str) -> Result<WorkspaceFile, String> {
    let mime = image_mime(name).unwrap_or("application/octet-stream");
    let bytes = fs::read(path).map_err(|_| "Non riesco a leggere questo file.".to_string())?;
    let truncated = bytes.len() > MAX_IMAGE;
    let data_url = if truncated {
        None
    } else {
        Some(format!("data:{mime};base64,{}", to_base64(&bytes)))
    };
    let text = if mime == "image/svg+xml" {
        let slice = if bytes.len() > MAX_READ {
            &bytes[..MAX_READ]
        } else {
            &bytes
        };
        String::from_utf8_lossy(slice).into_owned()
    } else {
        String::new()
    };
    Ok(WorkspaceFile {
        rel: rel_from(root, path),
        text,
        truncated,
        kind: "image".into(),
        mime: Some(mime.into()),
        data_url,
    })
}

fn to_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (a << 16) | (b << 8) | c;
        out.push(TABLE[(n >> 18) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[tauri::command]
pub fn workspace_search(root: String, query: String) -> Result<Vec<WorkspaceHit>, String> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let root = resolve_inside(Path::new(&root), "")?;
    let git = load_gitignore(&root);
    let mut hits = Vec::new();
    let mut files_seen = 0;
    search_dir(&root, "", &needle, &git, &mut hits, &mut files_seen)?;
    Ok(hits)
}

fn walk_dir(
    dir: &Path,
    rel: &str,
    depth: u32,
    git: &[String],
    count: &mut usize,
    truncated: &mut bool,
) -> Result<Vec<WorkspaceNode>, String> {
    if depth >= MAX_DEPTH || *count >= MAX_NODES {
        *truncated = true;
        return Ok(Vec::new());
    }
    let mut entries = read_sorted(dir)?;
    let mut nodes = Vec::new();
    for (name, path, is_dir) in entries.drain(..) {
        if *count >= MAX_NODES {
            *truncated = true;
            break;
        }
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if ignored(&child_rel, &name, is_dir, git) {
            continue;
        }
        *count += 1;
        let children = if is_dir {
            let nested = load_gitignore(&path);
            let combined = merge_git(git, &nested);
            walk_dir(&path, &child_rel, depth + 1, &combined, count, truncated)?
        } else {
            Vec::new()
        };
        nodes.push(WorkspaceNode {
            name,
            rel: child_rel,
            dir: is_dir,
            children,
        });
    }
    Ok(nodes)
}

fn search_dir(
    dir: &Path,
    rel: &str,
    needle: &str,
    git: &[String],
    hits: &mut Vec<WorkspaceHit>,
    files_seen: &mut usize,
) -> Result<(), String> {
    if hits.len() >= MAX_SEARCH_HITS || *files_seen >= MAX_SEARCH_FILES {
        return Ok(());
    }
    let mut entries = read_sorted(dir)?;
    for (name, path, is_dir) in entries.drain(..) {
        if hits.len() >= MAX_SEARCH_HITS {
            break;
        }
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if ignored(&child_rel, &name, is_dir, git) {
            continue;
        }
        if is_dir {
            let nested = load_gitignore(&path);
            let combined = merge_git(git, &nested);
            search_dir(&path, &child_rel, needle, &combined, hits, files_seen)?;
            continue;
        }
        let path_hit = child_rel.to_ascii_lowercase().contains(needle)
            || name.to_ascii_lowercase().contains(needle);
        if path_hit {
            hits.push(WorkspaceHit {
                rel: child_rel.clone(),
                kind: "path".into(),
                line: None,
                snippet: None,
            });
            if hits.len() >= MAX_SEARCH_HITS {
                break;
            }
        }
        if looks_binary_name(&name) || (is_secret_name(&name) && !name.to_ascii_lowercase().contains(needle))
        {
            continue;
        }
        *files_seen += 1;
        if *files_seen > MAX_SEARCH_FILES {
            break;
        }
        if path_hit {
            continue;
        }
        let Ok(meta) = path.metadata() else {
            continue;
        };
        if meta.len() == 0 || meta.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        if let Some((idx, line)) = text
            .lines()
            .enumerate()
            .find(|(_, line)| line.to_ascii_lowercase().contains(needle))
        {
            let snippet = line.trim();
            let snippet = if snippet.chars().count() > 120 {
                format!("{}…", snippet.chars().take(119).collect::<String>())
            } else {
                snippet.to_string()
            };
            hits.push(WorkspaceHit {
                rel: child_rel,
                kind: "content".into(),
                line: Some((idx + 1) as u32),
                snippet: Some(snippet),
            });
        }
    }
    Ok(())
}

fn merge_git(base: &[String], extra: &[String]) -> Vec<String> {
    let mut out = base.to_vec();
    for item in extra {
        if !out.iter().any(|old| old == item) {
            out.push(item.clone());
        }
    }
    out
}

fn read_sorted(dir: &Path) -> Result<Vec<(String, PathBuf, bool)>, String> {
    let mut entries = Vec::new();
    let reader = fs::read_dir(dir).map_err(|_| "Non riesco a leggere la cartella.".to_string())?;
    for item in reader {
        let item = item.map_err(|_| "Non riesco a leggere la cartella.".to_string())?;
        let name = item.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." || skip_name(&name) {
            continue;
        }
        let path = item.path();
        let is_dir = item.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        if !is_dir && !path.is_file() {
            continue;
        }
        entries.push((name, path, is_dir));
    }
    entries.sort_by(|a, b| match (a.2, b.2) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.0.to_ascii_lowercase().cmp(&b.0.to_ascii_lowercase()),
    });
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn sandbox() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("ainside-ws-{stamp}"));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::write(dir.join("src/app.ts"), "export const n = 1;\n").unwrap();
        fs::write(dir.join("src/app.ts"), "export const n = 1;\nhello search\n").unwrap();
        fs::write(dir.join("node_modules/pkg/index.js"), "nope").unwrap();
        fs::write(dir.join(".gitignore"), "*.tmp\n").unwrap();
        fs::write(dir.join("noise.tmp"), "skip").unwrap();
        dir
    }

    #[test]
    fn tree_skips_ignored() {
        let dir = sandbox();
        let tree = workspace_tree(dir.to_string_lossy().into_owned()).expect("tree");
        let names: Vec<_> = tree.nodes.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"src"));
        assert!(!names.contains(&"node_modules"));
        assert!(!names.iter().any(|n| *n == "noise.tmp"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_and_search() {
        let dir = sandbox();
        let root = dir.to_string_lossy().into_owned();
        let file = workspace_read(root.clone(), "src/app.ts".into()).expect("read");
        assert!(file.text.contains("export const n"));
        let hits = workspace_search(root.clone(), "hello search".into()).expect("search");
        assert!(hits.iter().any(|h| h.rel == "src/app.ts"));
        assert!(workspace_read(root, "../app.ts".into()).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_png() {
        let dir = sandbox();
        let png: &[u8] = &[
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0,
            5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
        ];
        fs::write(dir.join("src/dot.png"), png).unwrap();
        let file = workspace_read(dir.to_string_lossy().into_owned(), "src/dot.png".into()).expect("png");
        assert_eq!(file.kind, "image");
        assert!(file
            .data_url
            .as_deref()
            .unwrap_or_default()
            .starts_with("data:image/png;base64,"));
        let _ = fs::remove_dir_all(&dir);
    }
}
