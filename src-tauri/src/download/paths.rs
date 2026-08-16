use std::fs;
use std::path::{Path, PathBuf};

pub fn safe_segment(value: &str) -> Result<&str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Nome non valido.".into());
    }
    let ok = trimmed.chars().all(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' )
    });
    if !ok || trimmed.contains("..") || trimmed.starts_with('.') {
        return Err("Nome file non valido.".into());
    }
    Ok(trimmed)
}

pub fn dest_file(root: &Path, model_id: &str, filename: &str) -> Result<PathBuf, String> {
    let model_id = safe_segment(model_id)?;
    let filename = safe_segment(filename)?;
    if !filename.ends_with(".gguf") {
        return Err("Il file non è un modello.".into());
    }
    Ok(root.join(model_id).join(filename))
}

pub fn part_file(dest: &Path) -> PathBuf {
    dest.with_extension("gguf.part")
}

pub fn hash_state_file(dest: &Path) -> PathBuf {
    dest.with_extension("gguf.part.sha")
}

pub fn remove_incomplete(dest: &Path) {
    let _ = fs::remove_file(part_file(dest));
    let _ = fs::remove_file(hash_state_file(dest));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn accepts_catalog_names() {
        assert_eq!(safe_segment("qwen35-9b").unwrap(), "qwen35-9b");
        assert_eq!(
            safe_segment("Qwen3.5-9B-Q4_K_M.gguf").unwrap(),
            "Qwen3.5-9B-Q4_K_M.gguf"
        );
    }

    #[test]
    fn rejects_traversal() {
        assert!(safe_segment("../secret").is_err());
        assert!(safe_segment("a/b").is_err());
        assert!(safe_segment("a\\b").is_err());
    }

    #[test]
    fn dest_nests_under_model() {
        let path = dest_file(Path::new("C:\\models"), "qwen35-9b", "Qwen3.5-9B-Q4_K_M.gguf").unwrap();
        assert_eq!(
            path,
            Path::new("C:\\models\\qwen35-9b\\Qwen3.5-9B-Q4_K_M.gguf")
        );
        assert_eq!(
            part_file(&path),
            Path::new("C:\\models\\qwen35-9b\\Qwen3.5-9B-Q4_K_M.gguf.part")
        );
        assert_eq!(
            hash_state_file(&path),
            Path::new("C:\\models\\qwen35-9b\\Qwen3.5-9B-Q4_K_M.gguf.part.sha")
        );
    }
}
