use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use super::hasher::{load_checkpoint, save_checkpoint, StreamingSha256};
use super::paths::{hash_state_file, part_file, remove_incomplete};
use super::space::ensure_space;
use super::verify::{digest_hex, feed_hasher, hashes_match, normalize_sha};

const CHUNK: usize = 256 * 1024;
const CHECKPOINT_STEP: u64 = 32 * 1024 * 1024;

pub struct TransferSpec {
    pub url: String,
    pub expected_bytes: u64,
    pub sha256: Option<String>,
    pub dest: PathBuf,
}

pub enum TransferOutcome {
    AlreadyDone,
    Completed,
    Cancelled { written: u64 },
}

enum DestCheck {
    Good,
    Bad,
    Cancelled,
}

pub fn run(
    spec: &TransferSpec,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64),
    mut on_verify: impl FnMut(u64),
) -> Result<TransferOutcome, String> {
    if !spec.url.starts_with("https://huggingface.co/") {
        return Err("L’indirizzo non è di Hugging Face.".into());
    }

    if let Some(parent) = spec.dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Non creo la cartella: {e}"))?;
    }

    let expected_sha = normalize_sha(spec.sha256.as_deref());
    let need_hash = expected_sha.is_some();

    if spec.dest.exists() {
        match check_dest(
            &spec.dest,
            spec.expected_bytes,
            expected_sha.as_deref(),
            cancel,
            &mut on_verify,
        )? {
            DestCheck::Good => {
                let _ = fs::remove_file(hash_state_file(&spec.dest));
                on_progress(spec.expected_bytes);
                return Ok(TransferOutcome::AlreadyDone);
            }
            DestCheck::Cancelled => {
                let size = fs::metadata(&spec.dest).map(|m| m.len()).unwrap_or(0);
                return Ok(TransferOutcome::Cancelled { written: size });
            }
            DestCheck::Bad => {
                fs::remove_file(&spec.dest)
                    .map_err(|e| format!("Non rimuovo il file danneggiato: {e}"))?;
                let _ = fs::remove_file(hash_state_file(&spec.dest));
            }
        }
    }

    let part = part_file(&spec.dest);
    let mut existing = if part.exists() {
        fs::metadata(&part).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let state_path = hash_state_file(&spec.dest);

    if existing > spec.expected_bytes && spec.expected_bytes > 0 {
        remove_incomplete(&spec.dest);
        existing = 0;
    }

    let remaining = spec.expected_bytes.saturating_sub(existing);
    if let Some(parent) = spec.dest.parent() {
        ensure_space(parent, remaining)?;
    }

    if cancel.load(Ordering::Relaxed) {
        return Ok(TransferOutcome::Cancelled { written: existing });
    }

    let mut hasher = StreamingSha256::new();
    let mut restored = false;
    if need_hash && existing > 0 {
        if let Some(expected) = expected_sha.as_deref() {
            if let Some(ready) = load_checkpoint(&state_path, expected, existing) {
                hasher = ready;
                restored = true;
                eprintln!(
                    "[AInside] ripresa senza rileggere il file (checksum già calcolata)"
                );
            }
        }
    }

    if spec.expected_bytes > 0 && existing == spec.expected_bytes {
        if !restored
            && !feed_existing(
                &mut hasher,
                &part,
                existing,
                need_hash,
                cancel,
                &mut on_verify,
            )?
        {
            return Ok(TransferOutcome::Cancelled { written: existing });
        }
        persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
        return finalize(
            spec,
            &part,
            existing,
            take_digest(hasher, need_hash),
            cancel,
            &mut on_verify,
        );
    }

    // Prima di aprire la connessione: così non la lasciamo ferma mentre rileggiamo il .part.
    if existing > 0
        && !restored
        && !feed_existing(
            &mut hasher,
            &part,
            existing,
            need_hash,
            cancel,
            &mut on_verify,
        )?
    {
        return Ok(TransferOutcome::Cancelled { written: existing });
    }
    if existing > 0 && !restored {
        persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
    }

    if cancel.load(Ordering::Relaxed) {
        return Ok(TransferOutcome::Cancelled { written: existing });
    }

    let client = reqwest::blocking::Client::builder()
        .user_agent("AInside/0.1 (desktop; Windows)")
        .redirect(reqwest::redirect::Policy::limited(16))
        .connect_timeout(Duration::from_secs(30))
        .timeout(None)
        .build()
        .map_err(|e| rete(e))?;

    let mut request = client.get(&spec.url);
    if existing > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing}-"));
    }

    let mut response = request.send().map_err(|e| rete(e))?;
    let status = response.status();
    if status.as_u16() == 404 {
        return Err("Questo file non c’è più su Hugging Face.".into());
    }
    if status.as_u16() == 429 || status.as_u16() == 503 {
        return Err("Hugging Face è occupato. Riprova tra poco.".into());
    }
    if !status.is_success() {
        return Err(format!(
            "Hugging Face ha risposto {status}. Riprova tra poco."
        ));
    }

    let restart = existing > 0 && status.as_u16() != 206;
    if restart {
        remove_incomplete(&spec.dest);
        existing = 0;
        hasher = StreamingSha256::new();
    }

    if cancel.load(Ordering::Relaxed) {
        return Ok(TransferOutcome::Cancelled { written: existing });
    }

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(existing > 0)
        .truncate(existing == 0)
        .open(&part)
        .map_err(|e| format!("Non scrivo il file: {e}"))?;

    let mut written = existing;
    let mut last_checkpoint = existing;
    on_progress(written);

    let mut buf = vec![0u8; CHUNK];
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = file.flush();
            persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
            return Ok(TransferOutcome::Cancelled { written });
        }
        if spec.expected_bytes > 0 && written >= spec.expected_bytes {
            break;
        }
        let n = response.read(&mut buf).map_err(|e| rete(e))?;
        if n == 0 {
            break;
        }
        let mut take = n;
        if spec.expected_bytes > 0 {
            let left = spec.expected_bytes.saturating_sub(written) as usize;
            take = take.min(left);
        }
        if take == 0 {
            break;
        }
        file.write_all(&buf[..take])
            .map_err(|e| format!("Non scrivo il file: {e}"))?;
        if need_hash {
            hasher.update(&buf[..take]);
        }
        written += take as u64;
        on_progress(written);
        if need_hash && written.saturating_sub(last_checkpoint) >= CHECKPOINT_STEP {
            persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
            last_checkpoint = written;
        }
    }
    file.flush().map_err(|e| format!("Non chiudo il file: {e}"))?;
    drop(file);
    drop(response);

    if cancel.load(Ordering::Relaxed) {
        persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
        return Ok(TransferOutcome::Cancelled { written });
    }

    persist_checkpoint(&state_path, &hasher, expected_sha.as_deref());
    finalize(
        spec,
        &part,
        written,
        take_digest(hasher, need_hash),
        cancel,
        &mut on_verify,
    )
}

fn persist_checkpoint(path: &Path, hasher: &StreamingSha256, expected: Option<&str>) {
    let Some(expected) = expected else {
        return;
    };
    let _ = save_checkpoint(path, hasher, expected);
}

fn take_digest(hasher: StreamingSha256, need_hash: bool) -> Option<String> {
    if need_hash {
        Some(digest_hex(hasher))
    } else {
        None
    }
}

fn feed_existing(
    hasher: &mut StreamingSha256,
    path: &PathBuf,
    existing: u64,
    need_hash: bool,
    cancel: &AtomicBool,
    on_verify: &mut impl FnMut(u64),
) -> Result<bool, String> {
    if !need_hash || existing == 0 {
        return Ok(true);
    }
    on_verify(0);
    feed_hasher(hasher, path, existing, cancel, on_verify)
}

fn finalize(
    spec: &TransferSpec,
    part: &PathBuf,
    written: u64,
    digest: Option<String>,
    cancel: &AtomicBool,
    on_verify: &mut impl FnMut(u64),
) -> Result<TransferOutcome, String> {
    if spec.expected_bytes > 0 && written != spec.expected_bytes {
        return Err("Il file è arrivato incompleto. Non lo tengo come pronto.".into());
    }
    if cancel.load(Ordering::Relaxed) {
        return Ok(TransferOutcome::Cancelled { written });
    }

    if let Some(expected) = normalize_sha(spec.sha256.as_deref()) {
        let actual = if let Some(ready) = digest {
            ready
        } else {
            on_verify(0);
            let mut hasher = StreamingSha256::new();
            if !feed_hasher(&mut hasher, part, written, cancel, on_verify)? {
                return Ok(TransferOutcome::Cancelled { written });
            }
            digest_hex(hasher)
        };
        if !hashes_match(&actual, &expected) {
            remove_incomplete(&spec.dest);
            return Err("Il file è arrivato danneggiato. Non lo tengo.".into());
        }
    }

    fs::rename(part, &spec.dest).map_err(|e| format!("Non chiudo il trasferimento: {e}"))?;
    let _ = fs::remove_file(hash_state_file(&spec.dest));
    Ok(TransferOutcome::Completed)
}

fn check_dest(
    path: &Path,
    expected_bytes: u64,
    expected_sha: Option<&str>,
    cancel: &AtomicBool,
    on_verify: &mut impl FnMut(u64),
) -> Result<DestCheck, String> {
    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if expected_bytes > 0 && size != expected_bytes {
        return Ok(DestCheck::Bad);
    }
    let Some(expected) = expected_sha else {
        return Ok(if size > 0 {
            DestCheck::Good
        } else {
            DestCheck::Bad
        });
    };
    on_verify(0);
    let mut hasher = StreamingSha256::new();
    if !feed_hasher(&mut hasher, path, size, cancel, on_verify)? {
        return Ok(DestCheck::Cancelled);
    }
    if hashes_match(&digest_hex(hasher), expected) {
        Ok(DestCheck::Good)
    } else {
        Ok(DestCheck::Bad)
    }
}

fn rete(err: impl std::fmt::Display) -> String {
    format!("Non raggiungo Hugging Face. Controlla la rete. ({err})")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_hf_url() {
        let spec = TransferSpec {
            url: "https://example.com/a.gguf".into(),
            expected_bytes: 1,
            sha256: None,
            dest: PathBuf::from("C:\\tmp\\x.gguf"),
        };
        let cancel = AtomicBool::new(false);
        let err = run(&spec, &cancel, |_| {}, |_| {}).unwrap_err();
        assert!(err.contains("Hugging Face"));
    }
}
