use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

use super::ignore::looks_binary_name;
use super::patch::{
    apply_hunks, file_name, parse_edits, preview_edits, read_for_edit, secret_rel, write_forbidden,
    EditPreview, RawEdit,
};
use super::paths::{normalize_cite, resolve_write};

use crate::settings::{self, CodingWrite};

const MAX_WRITE: usize = 2 * 1024 * 1024;

#[derive(Default)]
pub struct WorkspaceHub {
    inner: Mutex<HubInner>,
}

#[derive(Default)]
struct HubInner {
    session: HashSet<String>,
    undo: HashMap<String, UndoBatch>,
}

#[derive(Clone)]
struct UndoBatch {
    files: Vec<UndoFile>,
}

#[derive(Clone)]
struct UndoFile {
    rel: String,
    previous: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingStatus {
    pub write: CodingWrite,
    pub trusted: bool,
    pub session: bool,
    pub can_write: bool,
    pub can_undo: bool,
    pub label: String,
    pub last_workspace: Option<String>,
    pub trusted_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub files: Vec<EditPreview>,
    pub wrote: Vec<String>,
}

fn root_key(root: &str) -> String {
    Path::new(root.trim())
        .components()
        .collect::<std::path::PathBuf>()
        .to_string_lossy()
        .into_owned()
}

fn session_has(hub: &WorkspaceHub, root: &str) -> bool {
    let key = root_key(root);
    hub.inner
        .lock()
        .expect("workspace lock")
        .session
        .iter()
        .any(|item| settings::same_folder(item, &key))
}

fn grant_session(hub: &WorkspaceHub, root: &str) {
    let key = root_key(root);
    let mut inner = hub.inner.lock().expect("workspace lock");
    inner.session.retain(|item| !settings::same_folder(item, &key));
    inner.session.insert(key);
}

fn drop_session(hub: &WorkspaceHub, root: Option<&str>) {
    let mut inner = hub.inner.lock().expect("workspace lock");
    if let Some(root) = root {
        inner.session.retain(|item| !settings::same_folder(item, root));
    } else {
        inner.session.clear();
    }
}

fn can_write(app: &AppHandle, hub: &WorkspaceHub, root: &str) -> Result<bool, String> {
    let settings = settings::current(app)?;
    Ok(settings.coding.write == CodingWrite::Always
        || settings::folder_trusted(&settings, root)
        || session_has(hub, root))
}

#[tauri::command]
pub fn coding_status(
    app: AppHandle,
    hub: State<WorkspaceHub>,
    root: Option<String>,
) -> Result<CodingStatus, String> {
    let settings = settings::current(&app)?;
    let root = root.unwrap_or_default();
    let trusted = !root.trim().is_empty() && settings::folder_trusted(&settings, &root);
    let session = !root.trim().is_empty() && session_has(&hub, &root);
    let can_write = settings.coding.write == CodingWrite::Always || trusted || session;
    let label = if can_write {
        "Può scrivere qui".into()
    } else {
        "Chiede".into()
    };
    let can_undo = if root.trim().is_empty() {
        false
    } else {
        hub.inner
            .lock()
            .expect("workspace lock")
            .undo
            .keys()
            .any(|item| settings::same_folder(item, &root))
    };
    Ok(CodingStatus {
        write: settings.coding.write,
        trusted,
        session,
        can_write,
        can_undo,
        label,
        last_workspace: settings.coding.last_workspace,
        trusted_folders: settings.coding.trusted_folders,
    })
}

#[tauri::command]
pub fn coding_grant(
    app: AppHandle,
    hub: State<WorkspaceHub>,
    root: Option<String>,
    level: String,
) -> Result<CodingStatus, String> {
    match level.as_str() {
        "session" => {
            let folder = root
                .as_deref()
                .filter(|item| !item.trim().is_empty())
                .ok_or_else(|| "Scegli una cartella del progetto.".to_string())?;
            grant_session(&hub, folder);
            let _ = settings::touch_workspace(&app, folder);
        }
        "folder" => {
            let folder = root
                .as_deref()
                .filter(|item| !item.trim().is_empty())
                .ok_or_else(|| "Scegli una cartella del progetto.".to_string())?;
            settings::trust_folder(&app, folder)?;
            grant_session(&hub, folder);
        }
        "always" => {
            settings::set_coding_write(&app, CodingWrite::Always)?;
        }
        "ask" => {
            settings::set_coding_write(&app, CodingWrite::Ask)?;
        }
        _ => return Err("Permesso non valido.".into()),
    }
    coding_status(app, hub, root)
}

#[tauri::command]
pub fn coding_revoke(
    app: AppHandle,
    hub: State<WorkspaceHub>,
    root: Option<String>,
) -> Result<CodingStatus, String> {
    if let Some(root) = root.as_deref().filter(|item| !item.trim().is_empty()) {
        settings::untrust_folder(&app, root)?;
        drop_session(&hub, Some(root));
    } else {
        settings::set_coding_write(&app, CodingWrite::Ask)?;
        drop_session(&hub, None);
    }
    coding_status(app, hub, root)
}

#[tauri::command]
pub fn workspace_preview(root: String, text: String) -> Result<Vec<EditPreview>, String> {
    if root.trim().is_empty() {
        return Err("Apri una cartella del progetto.".into());
    }
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| preview_edits(&root, &text)))
        .map_err(|_| "Non riesco a leggere le modifiche in questa risposta.".to_string())
}

#[tauri::command]
pub fn workspace_apply(
    app: AppHandle,
    hub: State<WorkspaceHub>,
    root: String,
    text: String,
    rels: Option<Vec<String>>,
    grant: Option<String>,
    allow_secrets: Option<bool>,
) -> Result<ApplyResult, String> {
    if root.trim().is_empty() {
        return Err("Apri una cartella del progetto.".into());
    }
    if let Some(level) = grant.as_deref() {
        match level {
            "once" => {}
            "session" => grant_session(&hub, &root),
            "folder" => {
                settings::trust_folder(&app, &root)?;
                grant_session(&hub, &root);
            }
            "always" => {
                settings::set_coding_write(&app, CodingWrite::Always)?;
            }
            _ => return Err("Permesso non valido.".into()),
        }
    } else if !can_write(&app, &hub, &root)? {
        return Err("Serve il permesso per scrivere.".into());
    }
    let _ = settings::touch_workspace(&app, &root);
    let rels = rels.unwrap_or_default();
    let allow_secrets = allow_secrets.unwrap_or(false);

    let parsed = parse_edits(&text);
    let wanted: Vec<RawEdit> = if rels.is_empty() {
        parsed
    } else {
        parsed
            .into_iter()
            .filter(|edit| {
                rels.iter()
                    .any(|rel| normalize_cite(rel) == normalize_cite(&edit.rel))
            })
            .collect()
    };
    if wanted.iter().any(|edit| secret_rel(&edit.rel)) && !allow_secrets {
        return Err("Questo file è riservato. Conferma per scriverlo.".into());
    }

    let mut snapshots = Vec::new();
    let mut planned = Vec::new();
    let mut files = Vec::new();
    for edit in &wanted {
        match prepare_write(&root, edit) {
            Ok(plan) => {
                snapshots.push(UndoFile {
                    rel: plan.rel.clone(),
                    previous: plan.previous.clone(),
                });
                files.push(EditPreview {
                    rel: plan.rel.clone(),
                    status: "applied".into(),
                    added: plan.added,
                    removed: plan.removed,
                    secret: secret_rel(&plan.rel),
                    created: plan.previous.is_none(),
                    error: None,
                });
                planned.push(plan);
            }
            Err(card) => files.push(card),
        }
    }

    if planned.is_empty() {
        return Ok(ApplyResult {
            files,
            wrote: Vec::new(),
        });
    }

    {
        let mut inner = hub.inner.lock().expect("workspace lock");
        inner.undo.insert(root_key(&root), UndoBatch { files: snapshots });
    }
    let mut wrote = Vec::new();
    for plan in planned {
        write_atomic(&plan.path, &plan.next)?;
        wrote.push(plan.rel);
    }
    Ok(ApplyResult { files, wrote })
}

#[tauri::command]
pub fn workspace_undo(
    hub: State<WorkspaceHub>,
    root: String,
) -> Result<Vec<String>, String> {
    if root.trim().is_empty() {
        return Err("Apri una cartella del progetto.".into());
    }
    let batch = {
        let mut inner = hub.inner.lock().expect("workspace lock");
        let key = inner
            .undo
            .keys()
            .find(|item| settings::same_folder(item, &root))
            .cloned();
        key.and_then(|key| inner.undo.remove(&key))
    };
    let Some(batch) = batch else {
        return Err("Non c’è niente da annullare.".into());
    };
    let mut restored = Vec::new();
    for file in batch.files.into_iter().rev() {
        let path = resolve_write(Path::new(&root), &file.rel)?;
        match file.previous {
            Some(text) => write_atomic(&path, &text)?,
            None => {
                if path.is_file() {
                    fs::remove_file(&path).map_err(|_| "Non tolgo il file creato.".to_string())?;
                }
            }
        }
        restored.push(file.rel);
    }
    Ok(restored)
}

struct WritePlan {
    rel: String,
    path: std::path::PathBuf,
    previous: Option<String>,
    next: String,
    added: u32,
    removed: u32,
}

fn prepare_write(root: &str, edit: &RawEdit) -> Result<WritePlan, EditPreview> {
    let rel = normalize_cite(&edit.rel);
    let fail = |message: String| EditPreview {
        rel: rel.clone(),
        status: "error".into(),
        added: 0,
        removed: 0,
        secret: secret_rel(&rel),
        created: false,
        error: Some(message),
    };
    if write_forbidden(&rel) {
        return Err(fail("Questa cartella non si tocca.".into()));
    }
    if looks_binary_name(&file_name(&rel)) {
        return Err(fail("Questo file non è testo.".into()));
    }
    let path = resolve_write(Path::new(root), &rel).map_err(fail)?;
    let exists = path.is_file();
    let previous = if exists {
        Some(read_for_edit(&path).map_err(fail)?)
    } else {
        None
    };
    let next = if let Some(replace) = &edit.replace {
        if exists {
            if previous.as_ref().map(String::len).unwrap_or(0) > super::MAX_READ {
                return Err(fail(format!(
                    "Non sostituisco tutto `{}`: è troppo lungo.",
                    file_name(&rel)
                )));
            }
        }
        replace.clone()
    } else {
        let source = previous.clone().unwrap_or_default();
        apply_hunks(&source, &edit.hunks).map_err(|_| {
            fail(format!("Non trovo quel pezzo in `{}`.", file_name(&rel)))
        })?
    };
    if next.len() > MAX_WRITE {
        return Err(fail("Questo file è troppo grande.".into()));
    }
    let added = if next.is_empty() { 0 } else { next.lines().count() as u32 };
    let removed = previous
        .as_ref()
        .map(|text| if text.is_empty() { 0 } else { text.lines().count() as u32 })
        .unwrap_or(0);
    Ok(WritePlan {
        rel,
        path,
        previous,
        next,
        added,
        removed,
    })
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|_| "Non creo la cartella.".to_string())?;
    }
    let name = path
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or("file");
    let tmp = path.with_file_name(format!(".{name}.ainside-tmp"));
    fs::write(&tmp, contents).map_err(|_| "Non scrivo il file.".to_string())?;
    if path.exists() {
        let bak = path.with_file_name(format!(".{name}.ainside-bak"));
        if fs::rename(path, &bak).is_err() {
            let _ = fs::remove_file(&tmp);
            return Err("Non sostituisco il file.".into());
        }
        if fs::rename(&tmp, path).is_err() {
            let _ = fs::rename(&bak, path);
            let _ = fs::remove_file(&tmp);
            return Err("Non sostituisco il file.".into());
        }
        let _ = fs::remove_file(&bak);
    } else if fs::rename(&tmp, path).is_err() {
        let _ = fs::remove_file(&tmp);
        return Err("Non scrivo il file.".into());
    }
    Ok(())
}
