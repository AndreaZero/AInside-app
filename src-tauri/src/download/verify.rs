use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use super::hasher::StreamingSha256;

const HASH_CHUNK: usize = 1024 * 1024;

pub fn normalize_sha(value: Option<&str>) -> Option<String> {
    let raw = value?.trim().to_ascii_lowercase();
    if raw.len() == 64 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(raw)
    } else {
        None
    }
}

pub fn digest_hex(hasher: StreamingSha256) -> String {
    hasher.finalize()
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut hasher = StreamingSha256::new();
    let len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if !feed_hasher(
        &mut hasher,
        path,
        len,
        &AtomicBool::new(false),
        |_| {},
    )? {
        return Err("Verifica interrotta.".into());
    }
    Ok(digest_hex(hasher))
}

/// Legge `len` byte da `path` e li accumula nell’hasher. `Ok(false)` = annullato.
pub fn feed_hasher(
    hasher: &mut StreamingSha256,
    path: &Path,
    len: u64,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64),
) -> Result<bool, String> {
    if len == 0 {
        on_progress(0);
        return Ok(true);
    }
    let mut file = File::open(path).map_err(|e| format!("Non apro il file: {e}"))?;
    let mut buf = vec![0u8; HASH_CHUNK];
    let mut hashed = 0u64;
    while hashed < len {
        if cancel.load(Ordering::Relaxed) {
            return Ok(false);
        }
        let want = ((len - hashed) as usize).min(buf.len());
        let n = file
            .read(&mut buf[..want])
            .map_err(|e| format!("Non leggo il file: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        hashed += n as u64;
        on_progress(hashed);
    }
    if hashed != len {
        return Err("Non ho letto tutto il file.".into());
    }
    Ok(true)
}

pub fn hashes_match(actual: &str, expected: &str) -> bool {
    actual.eq_ignore_ascii_case(expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::Write;

    #[test]
    fn known_sha256() {
        let digest = hex::encode(Sha256::digest(b"abc"));
        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn normalize_rejects_short() {
        assert!(normalize_sha(Some("abc")).is_none());
        assert!(normalize_sha(Some("")).is_none());
        assert!(normalize_sha(None).is_none());
    }

    #[test]
    fn file_hash_matches_bytes() {
        let dir = std::env::temp_dir().join("ainside-hash-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("abc.bin");
        let mut file = File::create(&path).unwrap();
        file.write_all(b"abc").unwrap();
        drop(file);
        assert_eq!(
            sha256_file(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn feed_matches_sha256_file() {
        let dir = std::env::temp_dir().join("ainside-hash-feed-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("chunk.bin");
        let data = vec![0xABu8; 300_000];
        let mut file = File::create(&path).unwrap();
        file.write_all(&data).unwrap();
        drop(file);
        let full = sha256_file(&path).unwrap();
        let mut hasher = StreamingSha256::new();
        assert!(feed_hasher(
            &mut hasher,
            &path,
            data.len() as u64,
            &AtomicBool::new(false),
            |_| {}
        )
        .unwrap());
        assert_eq!(digest_hex(hasher), full);
        let _ = std::fs::remove_file(&path);
    }
}
