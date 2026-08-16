//! Download GGUF da Hugging Face: progresso, pausa, ripresa, integrità.

mod hasher;
mod paths;
mod space;
mod transfer;
mod types;
mod verify;

pub use paths::{dest_file, part_file, remove_incomplete};
pub use types::{DownloadJob, DownloadStatus};

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use crate::catalog::{self, CatalogModel, GgufVariant};
use crate::settings;

use transfer::{run, TransferOutcome, TransferSpec};
use types::{status_label, CHOSEN_NOTE};
use verify::normalize_sha;

const EVENT: &str = "downloads-update";
const PROGRESS_STEP: u64 = 2 * 1024 * 1024;

#[derive(Clone, Default)]
pub struct DownloadManager {
    inner: Arc<Inner>,
}

#[derive(Default)]
struct Inner {
    jobs: Mutex<HashMap<String, DownloadJob>>,
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl DownloadManager {
    fn put(&self, job: DownloadJob) -> DownloadJob {
        let mut jobs = self.inner.jobs.lock().expect("download lock");
        jobs.insert(job.id.clone(), job.clone());
        job
    }

    fn get(&self, id: &str) -> Option<DownloadJob> {
        self.inner.jobs.lock().expect("download lock").get(id).cloned()
    }

    fn flag(&self, id: &str) -> Arc<AtomicBool> {
        let mut flags = self.inner.flags.lock().expect("download lock");
        flags
            .entry(id.to_string())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    }

    fn snapshot(&self) -> Vec<DownloadJob> {
        let mut jobs: Vec<_> = self
            .inner
            .jobs
            .lock()
            .expect("download lock")
            .values()
            .cloned()
            .collect();
        jobs.sort_by(|a, b| a.model_name.cmp(&b.model_name).then(a.filename.cmp(&b.filename)));
        jobs
    }

    pub fn forget(&self, variant_id: &str) {
        self.inner
            .jobs
            .lock()
            .expect("download lock")
            .remove(variant_id);
        self.inner
            .flags
            .lock()
            .expect("download lock")
            .remove(variant_id);
    }

    pub fn is_busy(&self, variant_id: &str) -> bool {
        self.inner
            .jobs
            .lock()
            .expect("download lock")
            .get(variant_id)
            .is_some_and(|job| {
                matches!(
                    job.status,
                    DownloadStatus::InCorso | DownloadStatus::InCoda | DownloadStatus::Controllo
                )
            })
    }
}

fn emit(app: &AppHandle, job: &DownloadJob) {
    let _ = app.emit(EVENT, job);
}

fn find_variant<'a>(
    catalog: &'a catalog::CatalogFile,
    model_id: &str,
    variant_id: &str,
) -> Result<(&'a CatalogModel, &'a GgufVariant), String> {
    let model = catalog
        .models
        .iter()
        .find(|item| item.id == model_id)
        .ok_or_else(|| "Questo modello non è nel catalogo.".to_string())?;
    let variant = model
        .variants
        .iter()
        .find(|item| item.id == variant_id)
        .ok_or_else(|| "Questa versione non è nel catalogo.".to_string())?;
    Ok((model, variant))
}

fn build_job(
    model: &CatalogModel,
    variant: &GgufVariant,
    dest: &PathBuf,
    received: u64,
    status: DownloadStatus,
    message: impl Into<String>,
    manual: bool,
) -> DownloadJob {
    DownloadJob {
        id: variant.id.clone(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        variant_id: variant.id.clone(),
        filename: variant.filename.clone(),
        dest_path: dest.to_string_lossy().into_owned(),
        expected_bytes: variant.size_bytes,
        received_bytes: received,
        verified_bytes: 0,
        status,
        status_label: status_label(status),
        message: message.into(),
        error_detail: None,
        chosen_note: if manual {
            "Hai scelto tu questa versione.".into()
        } else {
            CHOSEN_NOTE.into()
        },
    }
}

fn discover(app: &AppHandle) -> Result<Vec<DownloadJob>, String> {
    let root = settings::download_root(app)?;
    let catalog = catalog::load_catalog()?;
    let mut found = Vec::new();
    for model in &catalog.models {
        for variant in &model.variants {
            let dest = dest_file(&root, &model.id, &variant.filename)?;
            let part = part_file(&dest);
            if dest.exists() {
                let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
                found.push(build_job(
                    model,
                    variant,
                    &dest,
                    size,
                    DownloadStatus::Pronto,
                    "Pronto sul disco.",
                    false,
                ));
            } else if part.exists() {
                let size = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
                found.push(build_job(
                    model,
                    variant,
                    &dest,
                    size,
                    DownloadStatus::InPausa,
                    "In pausa. Il pezzo resta da parte, non come modello.",
                    false,
                ));
            }
        }
    }
    Ok(found)
}

fn merge_discovered(manager: &DownloadManager, discovered: Vec<DownloadJob>) {
    let mut jobs = manager.inner.jobs.lock().expect("download lock");
    for job in discovered {
        match jobs.get(&job.id).map(|item| item.status) {
            Some(DownloadStatus::InCorso | DownloadStatus::Controllo | DownloadStatus::InCoda) => {}
            Some(DownloadStatus::Fallito) if job.status != DownloadStatus::Pronto => {}
            _ => {
                jobs.insert(job.id.clone(), job);
            }
        }
    }
}

fn start_inner(
    app: AppHandle,
    manager: DownloadManager,
    model_id: String,
    variant_id: String,
    manual: bool,
) -> Result<DownloadJob, String> {
    if let Some(existing) = manager.get(&variant_id) {
        if matches!(
            existing.status,
            DownloadStatus::InCorso | DownloadStatus::Controllo | DownloadStatus::InCoda
        ) {
            return Ok(existing);
        }
        if existing.status == DownloadStatus::Pronto {
            return Ok(existing);
        }
    }

    let catalog = catalog::load_catalog()?;
    let (model, variant) = find_variant(&catalog, &model_id, &variant_id)?;
    let root = settings::download_root(&app)?;
    let dest = dest_file(&root, &model.id, &variant.filename)?;
    let part = part_file(&dest);
    let received = if dest.exists() {
        fs::metadata(&dest).map(|m| m.len()).unwrap_or(0)
    } else if part.exists() {
        fs::metadata(&part).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let flag = manager.flag(&variant.id);
    flag.store(false, Ordering::Relaxed);

    let job = manager.put(build_job(
        model,
        variant,
        &dest,
        received,
        DownloadStatus::InCoda,
        "Preparo il trasferimento.",
        manual,
    ));
    emit(&app, &job);

    let spec = TransferSpec {
        url: variant.url.clone(),
        expected_bytes: variant.size_bytes,
        sha256: normalize_sha(variant.sha256.as_deref()),
        dest,
    };
    let job_id = job.id.clone();
    let model_name = model.name.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut last = received;
        let mut last_verify: Option<u64> = None;
        let mut last_log_pct: u64 = 999;
        eprintln!("[AInside] {model_name} — trasferimento avviato");
        let outcome = run(
            &spec,
            &flag,
            |bytes| {
                if bytes.saturating_sub(last) < PROGRESS_STEP && bytes < spec.expected_bytes {
                    return;
                }
                last = bytes;
                if let Some(mut current) = manager.get(&job_id) {
                    current.received_bytes = bytes;
                    current.status = DownloadStatus::InCorso;
                    current.status_label = status_label(DownloadStatus::InCorso);
                    current.message = format!("Sto prendendo {model_name} da Hugging Face.");
                    let current = manager.put(current);
                    emit(&app, &current);
                }
            },
            |hashed| {
                let jump = last_verify.map(|v| hashed.saturating_sub(v)).unwrap_or(u64::MAX);
                let done = spec.expected_bytes > 0 && hashed >= spec.expected_bytes;
                if jump < PROGRESS_STEP && !done {
                    return;
                }
                last_verify = Some(hashed);
                let pct = if spec.expected_bytes > 0 {
                    hashed.saturating_mul(100) / spec.expected_bytes
                } else {
                    0
                };
                if pct != last_log_pct && (pct == 0 || pct == 100 || pct / 10 != last_log_pct / 10)
                {
                    eprintln!("[AInside] {model_name} — controllo integrità {pct}%");
                    last_log_pct = pct;
                }
                if let Some(mut current) = manager.get(&job_id) {
                    current.verified_bytes = hashed;
                    current.status = DownloadStatus::Controllo;
                    current.status_label = status_label(DownloadStatus::Controllo);
                    current.message = format!(
                        "Controllo che il file sia integro ({pct}%). Non chiudere l’app."
                    );
                    let current = manager.put(current);
                    emit(&app, &current);
                }
            },
        );

        let finished = match outcome {
            Ok(TransferOutcome::AlreadyDone) | Ok(TransferOutcome::Completed) => {
                eprintln!("[AInside] {model_name} — file integro, pronto sul disco");
                if let Some(mut current) = manager.get(&job_id) {
                    current.received_bytes = spec.expected_bytes;
                    current.verified_bytes = spec.expected_bytes;
                    current.with_status(DownloadStatus::Pronto, "Pronto sul disco.")
                } else {
                    return;
                }
            }
            Ok(TransferOutcome::Cancelled { written }) => {
                eprintln!("[AInside] {model_name} — trasferimento in pausa");
                if let Some(mut current) = manager.get(&job_id) {
                    current.received_bytes = written;
                    current.with_status(
                        DownloadStatus::InPausa,
                        "In pausa. Il pezzo resta da parte, non come modello.",
                    )
                } else {
                    return;
                }
            }
            Err(message) => {
                eprintln!("[AInside] {model_name} — trasferimento non riuscito: {message}");
                if let Some(mut current) = manager.get(&job_id) {
                    current.error_detail = Some(message.clone());
                    current.with_status(DownloadStatus::Fallito, message)
                } else {
                    return;
                }
            }
        };
        let finished = manager.put(finished);
        emit(&app, &finished);
    });

    Ok(job)
}

#[tauri::command]
pub fn start_download(
    app: AppHandle,
    manager: State<DownloadManager>,
    model_id: String,
    variant_id: String,
    manual: Option<bool>,
) -> Result<DownloadJob, String> {
    start_inner(
        app,
        manager.inner().clone(),
        model_id,
        variant_id,
        manual.unwrap_or(false),
    )
}

#[tauri::command]
pub fn cancel_download(
    app: AppHandle,
    manager: State<DownloadManager>,
    id: String,
) -> Result<DownloadJob, String> {
    let Some(job) = manager.get(&id) else {
        return Err("Nessun trasferimento con questo nome.".into());
    };
    manager.flag(&id).store(true, Ordering::Relaxed);
    if matches!(
        job.status,
        DownloadStatus::InCorso | DownloadStatus::InCoda | DownloadStatus::Controllo
    ) {
        let paused = manager.put(job.clone().with_status(
            DownloadStatus::InPausa,
            "Fermo il trasferimento. Il pezzo resta da parte, non come modello.",
        ));
        emit(&app, &paused);
        return Ok(paused);
    }
    Ok(job)
}

#[tauri::command]
pub fn discard_download(
    app: AppHandle,
    manager: State<DownloadManager>,
    id: String,
) -> Result<Vec<DownloadJob>, String> {
    manager.flag(&id).store(true, Ordering::Relaxed);
    if let Some(job) = manager.get(&id) {
        if job.status == DownloadStatus::Pronto {
            return Err("È già sul disco. Per toglierlo servirà la libreria.".into());
        }
        if matches!(
            job.status,
            DownloadStatus::InCorso | DownloadStatus::InCoda | DownloadStatus::Controllo
        ) {
            return Err("Prima ferma il trasferimento, poi togli il pezzo.".into());
        }
        let dest = PathBuf::from(&job.dest_path);
        remove_incomplete(&dest);
        manager.inner.jobs.lock().expect("download lock").remove(&id);
        manager.inner.flags.lock().expect("download lock").remove(&id);
    }
    list_downloads(app, manager)
}

#[tauri::command]
pub fn list_downloads(
    app: AppHandle,
    manager: State<DownloadManager>,
) -> Result<Vec<DownloadJob>, String> {
    merge_discovered(manager.inner(), discover(&app)?);
    Ok(manager.snapshot())
}
