use std::path::{Component, Path, PathBuf};

pub fn normalize_rel(rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }
    if trimmed.starts_with('/') || trimmed.contains(':') {
        return Err("Usa un percorso dentro la cartella aperta.".into());
    }
    let mut out = PathBuf::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains('\0') {
            return Err("Percorso non valido.".into());
        }
        out.push(part);
    }
    Ok(out)
}

pub fn looks_like_rel(text: &str) -> bool {
    let text = text.trim();
    if text.is_empty() || text.len() > 240 {
        return false;
    }
    if text.contains("://") || text.contains('@') {
        return false;
    }
    text.contains('/') || text.contains('\\') || text.contains('.')
}

pub fn normalize_cite(rel: &str) -> String {
    rel.trim()
        .trim_start_matches("./")
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

pub fn resolve_write(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root = abs(root)?;
    let rel_path = normalize_rel(rel)?;
    if rel_path.as_os_str().is_empty() {
        return Err("Scegli un file.".into());
    }
    Ok(root.join(rel_path))
}

pub fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root = abs(root)?;
    if !root.is_dir() {
        return Err("Questa cartella non c’è più.".into());
    }
    let rel_path = normalize_rel(rel)?;
    if rel_path.as_os_str().is_empty() {
        return Ok(root);
    }
    let joined = root.join(&rel_path);
    let abs_file = abs(&joined)?;
    if !is_inside(&root, &abs_file) {
        return Err("Quel file è fuori dalla cartella aperta.".into());
    }
    Ok(abs_file)
}

pub fn rel_from(root: &Path, path: &Path) -> String {
    let root = strip_verbatim(root.to_path_buf());
    let path = strip_verbatim(path.to_path_buf());
    path.strip_prefix(&root)
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn abs(path: &Path) -> Result<PathBuf, String> {
    let full = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Non trovo la cartella di lavoro: {e}"))?
            .join(path)
    };
    let canon = full
        .canonicalize()
        .map_err(|_| "Non trovo questo percorso.".to_string())?;
    Ok(strip_verbatim(canon))
}

fn strip_verbatim(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    let _ = text;
    path
}

fn is_inside(root: &Path, child: &Path) -> bool {
    let root: Vec<Component> = root.components().collect();
    let child: Vec<Component> = child.components().collect();
    if child.len() < root.len() {
        return false;
    }
    root.iter().zip(child.iter()).all(|(left, right)| {
        #[cfg(windows)]
        {
            left.as_os_str().eq_ignore_ascii_case(right.as_os_str())
        }
        #[cfg(not(windows))]
        {
            left == right
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_segments() {
        assert!(normalize_rel("../secret").is_err());
        assert!(normalize_rel("src/../../etc").is_err());
        assert!(normalize_rel("src/app.ts").is_ok());
    }
}
