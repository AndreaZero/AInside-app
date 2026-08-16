//! Modelli già sul disco: lista, spazio, elimina, modello attivo.

mod types;

pub use types::{LibraryItem, LibrarySnapshot, LibraryStatus};

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::catalog;
use crate::download::{dest_file, part_file, remove_incomplete, DownloadManager};
use crate::settings::{self, ActiveModel};

use types::{classify, status_label};

fn locate(roots: &[PathBuf], model_id: &str, filename: &str) -> Option<(PathBuf, bool)> {
    for (index, root) in roots.iter().enumerate() {
        if let Ok(nested) = dest_file(root, model_id, filename) {
            if nested.exists() {
                return Some((nested, index == 0));
            }
        }
        let flat = root.join(filename);
        if flat.exists() {
            return Some((flat, index == 0));
        }
    }
    None
}

fn locate_part(roots: &[PathBuf], model_id: &str, filename: &str) -> Option<PathBuf> {
    for root in roots {
        if let Ok(dest) = dest_file(root, model_id, filename) {
            let part = part_file(&dest);
            if part.exists() {
                return Some(part);
            }
        }
        let flat = part_file(&root.join(filename));
        if flat.exists() {
            return Some(flat);
        }
    }
    None
}

fn scan(app: &AppHandle) -> Result<LibrarySnapshot, String> {
    let catalog = catalog::load_catalog()?;
    let roots = settings::library_roots(app)?;
    let settings = settings::current(app)?;
    let active_id = settings.active.as_ref().map(|item| item.variant_id.clone());

    let mut items = Vec::new();
    for model in &catalog.models {
        for variant in &model.variants {
            if let Some((path, in_download_root)) = locate(&roots, &model.id, &variant.filename) {
                let bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let status = classify(bytes, variant.size_bytes, false);
                items.push(LibraryItem {
                    model_id: model.id.clone(),
                    model_name: model.name.clone(),
                    variant_id: variant.id.clone(),
                    filename: variant.filename.clone(),
                    path: path.to_string_lossy().into_owned(),
                    in_download_root,
                    bytes,
                    expected_bytes: variant.size_bytes,
                    status,
                    status_label: status_label(status),
                    active: active_id.as_deref() == Some(variant.id.as_str())
                        && status == LibraryStatus::Pronto,
                });
                continue;
            }
            if let Some(part) = locate_part(&roots, &model.id, &variant.filename) {
                let bytes = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
                items.push(LibraryItem {
                    model_id: model.id.clone(),
                    model_name: model.name.clone(),
                    variant_id: variant.id.clone(),
                    filename: variant.filename.clone(),
                    path: part.to_string_lossy().into_owned(),
                    in_download_root: true,
                    bytes,
                    expected_bytes: variant.size_bytes,
                    status: LibraryStatus::Incompleto,
                    status_label: status_label(LibraryStatus::Incompleto),
                    active: false,
                });
            }
        }
    }

    items.sort_by(|a, b| a.model_name.cmp(&b.model_name).then(a.filename.cmp(&b.filename)));
    let total_bytes = items.iter().map(|item| item.bytes).sum();
    let ready_count = items
        .iter()
        .filter(|item| item.status == LibraryStatus::Pronto)
        .count() as u32;

    let active = settings.active.filter(|current| {
        items.iter().any(|item| {
            item.variant_id == current.variant_id && item.status == LibraryStatus::Pronto
        })
    });

    Ok(LibrarySnapshot {
        items,
        total_bytes,
        ready_count,
        active,
    })
}

fn remove_empty_model_dir(path: &Path, roots: &[PathBuf]) {
    let Some(parent) = path.parent() else {
        return;
    };
    if roots.iter().any(|root| root == parent) {
        return;
    }
    if fs::read_dir(parent)
        .map(|mut dir| dir.next().is_none())
        .unwrap_or(false)
    {
        let _ = fs::remove_dir(parent);
    }
}

#[tauri::command]
pub fn list_library(app: AppHandle) -> Result<LibrarySnapshot, String> {
    scan(&app)
}

#[tauri::command]
pub fn set_active_model(
    app: AppHandle,
    model_id: String,
    variant_id: String,
) -> Result<LibrarySnapshot, String> {
    let snapshot = scan(&app)?;
    let item = snapshot
        .items
        .iter()
        .find(|item| item.model_id == model_id && item.variant_id == variant_id)
        .ok_or_else(|| "Questo modello non è sul disco.".to_string())?;
    if item.status != LibraryStatus::Pronto {
        return Err("Questo file non è pronto da usare.".into());
    }
    settings::set_active(
        &app,
        Some(ActiveModel {
            model_id: item.model_id.clone(),
            variant_id: item.variant_id.clone(),
            path: item.path.clone(),
        }),
    )?;
    scan(&app)
}

#[tauri::command]
pub fn clear_active_model(app: AppHandle) -> Result<LibrarySnapshot, String> {
    settings::set_active(&app, None)?;
    scan(&app)
}

#[tauri::command]
pub fn remove_installed(
    app: AppHandle,
    manager: State<DownloadManager>,
    variant_id: String,
) -> Result<LibrarySnapshot, String> {
    if manager.is_busy(&variant_id) {
        return Err("Prima ferma il trasferimento, poi togli il file.".into());
    }
    let snapshot = scan(&app)?;
    let item = snapshot
        .items
        .iter()
        .find(|item| item.variant_id == variant_id)
        .ok_or_else(|| "Non trovo questo file.".to_string())?;

    let path = PathBuf::from(&item.path);
    let dest = if item.status == LibraryStatus::Incompleto {
        path.with_extension("gguf")
    } else {
        path.clone()
    };
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Non tolgo il file: {e}"))?;
    }
    remove_incomplete(&dest);
    let roots = settings::library_roots(&app)?;
    remove_empty_model_dir(&path, &roots);

    if snapshot
        .active
        .as_ref()
        .is_some_and(|active| active.variant_id == variant_id)
    {
        settings::set_active(&app, None)?;
    }

    manager.forget(&variant_id);
    let _ = app.emit("download-forgotten", &variant_id);

    scan(&app)
}
