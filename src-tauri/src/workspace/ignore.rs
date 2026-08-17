use std::path::Path;

const SKIP_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "target",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "coverage",
    ".idea",
    ".ds_store",
    "thumbs.db",
];

const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "avif", "tif", "tiff",
];

const SKIP_EXTS: &[&str] = &[
    "exe", "dll", "so", "dylib", "wasm", "zip", "7z", "gz", "rar", "pdf", "woff", "woff2",
    "ttf", "eot", "mp3", "mp4", "webm", "ogg", "wav", "sqlite", "bin", "pyc", "class", "o",
    "obj", "lib", "pdb", "gguf", "safetensors", "onnx",
];

pub fn skip_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SKIP_NAMES.iter().any(|item| *item == lower)
}

pub fn is_image_name(name: &str) -> bool {
    ext(name).is_some_and(|item| IMAGE_EXTS.contains(&item.as_str()))
}

pub fn image_mime(name: &str) -> Option<&'static str> {
    match ext(name)?.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

pub fn looks_binary_name(name: &str) -> bool {
    ext(name).is_some_and(|item| {
        SKIP_EXTS.contains(&item.as_str()) || IMAGE_EXTS.contains(&item.as_str())
    })
}

pub fn is_secret_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == ".env"
        || lower.starts_with(".env.")
        || lower == "id_rsa"
        || lower == "id_ed25519"
        || lower == "credentials.json"
        || lower.ends_with(".pem")
        || lower.ends_with(".pfx")
        || lower.ends_with(".p12")
}

pub fn parse_gitignore(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('!'))
        .map(|line| line.trim_end_matches('/').to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

pub fn ignored(rel: &str, name: &str, is_dir: bool, git: &[String]) -> bool {
    if skip_name(name) {
        return true;
    }
    let rel = rel.replace('\\', "/");
    git.iter().any(|pat| git_match(pat, &rel, name, is_dir))
}

fn git_match(pat: &str, rel: &str, name: &str, is_dir: bool) -> bool {
    let mut pat = pat.trim();
    if pat.is_empty() {
        return false;
    }
    if pat.ends_with('/') {
        if !is_dir {
            return false;
        }
        pat = pat.trim_end_matches('/');
    }
    let anchored = pat.starts_with('/');
    if anchored {
        pat = &pat[1..];
    }
    if pat.contains('/') {
        return glob_match(pat, rel);
    }
    if anchored {
        return glob_match(pat, rel.split('/').next().unwrap_or(rel));
    }
    glob_match(pat, name) || rel.split('/').any(|part| glob_match(pat, part))
}

fn glob_match(pat: &str, text: &str) -> bool {
    wild(pat.as_bytes(), text.as_bytes())
}

fn wild(pat: &[u8], text: &[u8]) -> bool {
    let mut p = 0;
    let mut t = 0;
    let mut star_p = None;
    let mut star_t = 0;
    while t < text.len() {
        if p < pat.len() && (pat[p] == b'?' || pat[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pat.len() && pat[p] == b'*' {
            star_p = Some(p);
            star_t = t;
            p += 1;
        } else if let Some(sp) = star_p {
            p = sp + 1;
            star_t += 1;
            t = star_t;
        } else {
            return false;
        }
    }
    while p < pat.len() && pat[p] == b'*' {
        p += 1;
    }
    p == pat.len()
}

pub fn load_gitignore(dir: &Path) -> Vec<String> {
    let path = dir.join(".gitignore");
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    parse_gitignore(&text)
}

fn ext(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|item| item.to_str())
        .map(|item| item.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_node_modules() {
        assert!(ignored("node_modules", "node_modules", true, &[]));
        assert!(!ignored("src", "src", true, &[]));
    }

    #[test]
    fn gitignore_star_log() {
        let git = parse_gitignore("*.log\n# c\n!keep.log\n");
        assert!(ignored("debug.log", "debug.log", false, &git));
        assert!(!ignored("app.ts", "app.ts", false, &git));
    }

    #[test]
    fn secrets() {
        assert!(is_secret_name(".env"));
        assert!(is_secret_name(".env.local"));
        assert!(is_secret_name("key.pem"));
        assert!(!is_secret_name("app.ts"));
    }

    #[test]
    fn images() {
        assert!(is_image_name("logo.PNG"));
        assert!(is_image_name("favicon.ico"));
        assert_eq!(image_mime("icon.svg"), Some("image/svg+xml"));
        assert!(!is_image_name("app.ts"));
    }
}
