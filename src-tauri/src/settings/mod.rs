//! Impostazioni persistenti: cartelle libreria e destinazione download.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PerfProfile {
    Risparmio,
    #[default]
    Bilanciato,
    Massime,
}

impl PerfProfile {
    pub fn label_it(self) -> &'static str {
        match self {
            Self::Risparmio => "Risparmio",
            Self::Bilanciato => "Bilanciato",
            Self::Massime => "Massime prestazioni",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub library: LibrarySettings,
    #[serde(default)]
    pub active: Option<ActiveModel>,
    #[serde(default)]
    pub profile: PerfProfile,
    #[serde(default)]
    pub expert: ExpertSettings,
    #[serde(default)]
    pub api: ApiSettings,
    #[serde(default)]
    pub thinking: bool,
    #[serde(default)]
    pub coding: CodingSettings,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CodingWrite {
    #[default]
    Ask,
    Always,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingSettings {
    #[serde(default)]
    pub write: CodingWrite,
    #[serde(default)]
    pub trusted_folders: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_workspace: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSettings {
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertSettings {
    #[serde(default)]
    pub enabled: bool,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
    pub min_p: Option<f32>,
    pub repeat_penalty: Option<f32>,
    pub context: Option<u32>,
    pub threads: Option<u32>,
    pub batch: Option<u32>,
    pub gpu_layers: Option<i32>,
    pub flash_attention: Option<bool>,
    pub kv_cache: Option<String>,
    pub seed: Option<i64>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveModel {
    pub model_id: String,
    pub variant_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettings {
    pub download_root: String,
    pub extra_roots: Vec<String>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Non trovo la cartella dati: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Non creo la cartella dati: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn default_download_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Non trovo la cartella dati: {e}"))?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| format!("Non creo la cartella modelli: {e}"))?;
    Ok(dir)
}

fn normalize_root(path: &str) -> String {
    Path::new(path.trim())
        .components()
        .collect::<PathBuf>()
        .to_string_lossy()
        .into_owned()
}

fn load_or_default(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Non leggo le impostazioni: {e}"))?;
        let parsed: AppSettings = serde_json::from_str(&raw)
            .map_err(|e| format!("Impostazioni danneggiate: {e}"))?;
        return Ok(parsed);
    }
    Ok(AppSettings {
        library: LibrarySettings {
            download_root: default_download_root(app)?.to_string_lossy().into_owned(),
            extra_roots: Vec::new(),
        },
        active: None,
        profile: PerfProfile::Bilanciato,
        expert: ExpertSettings::default(),
        api: ApiSettings::default(),
        thinking: false,
        coding: CodingSettings::default(),
    })
}

fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Non preparo le impostazioni: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Non salvo le impostazioni: {e}"))?;
    Ok(())
}

fn ensure_dir(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Non posso usare questa cartella: {e}"))
}

pub fn current(app: &AppHandle) -> Result<AppSettings, String> {
    let settings = load_or_default(app)?;
    ensure_dir(&settings.library.download_root)?;
    Ok(settings)
}

pub fn download_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(current(app)?.library.download_root))
}

pub fn library_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let settings = current(app)?;
    let mut roots = vec![PathBuf::from(&settings.library.download_root)];
    for extra in settings.library.extra_roots {
        let path = PathBuf::from(extra);
        if !roots.contains(&path) {
            roots.push(path);
        }
    }
    Ok(roots)
}

pub fn set_active(app: &AppHandle, active: Option<ActiveModel>) -> Result<AppSettings, String> {
    let mut settings = current(app)?;
    settings.active = active;
    save(app, &settings)?;
    Ok(settings)
}

pub fn profile(app: &AppHandle) -> Result<PerfProfile, String> {
    Ok(current(app)?.profile)
}

pub fn expert(app: &AppHandle) -> Result<ExpertSettings, String> {
    Ok(current(app)?.expert)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    current(&app)
}

#[tauri::command]
pub fn set_perf_profile(app: AppHandle, profile: PerfProfile) -> Result<AppSettings, String> {
    let mut settings = current(&app)?;
    settings.profile = profile;
    save(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_expert(app: AppHandle, expert: ExpertSettings) -> Result<AppSettings, String> {
    let mut settings = current(&app)?;
    settings.expert = expert;
    save(&app, &settings)?;
    Ok(settings)
}

pub fn thinking_enabled(app: &AppHandle) -> bool {
    current(app).map(|settings| settings.thinking).unwrap_or(false)
}

#[tauri::command]
pub fn set_thinking(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = current(&app)?;
    settings.thinking = enabled;
    save(&app, &settings)?;
    Ok(settings)
}

pub fn touch_workspace(app: &AppHandle, path: &str) -> Result<(), String> {
    let root = normalize_root(path);
    if root.is_empty() {
        return Ok(());
    }
    let mut settings = current(app)?;
    if settings
        .coding
        .last_workspace
        .as_deref()
        .is_some_and(|old| same_folder(old, &root))
    {
        return Ok(());
    }
    settings.coding.last_workspace = Some(root);
    save(app, &settings)
}

pub fn same_folder(a: &str, b: &str) -> bool {
    let left = normalize_root(a);
    let right = normalize_root(b);
    #[cfg(windows)]
    {
        left.eq_ignore_ascii_case(&right)
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

pub fn folder_trusted(settings: &AppSettings, root: &str) -> bool {
    settings
        .coding
        .trusted_folders
        .iter()
        .any(|item| same_folder(item, root))
}

pub fn set_coding_write(app: &AppHandle, write: CodingWrite) -> Result<AppSettings, String> {
    let mut settings = current(app)?;
    settings.coding.write = write;
    save(app, &settings)?;
    Ok(settings)
}

pub fn trust_folder(app: &AppHandle, root: &str) -> Result<AppSettings, String> {
    let root = normalize_root(root);
    if root.is_empty() {
        return Err("Scegli una cartella del progetto.".into());
    }
    let mut settings = current(app)?;
    if !settings
        .coding
        .trusted_folders
        .iter()
        .any(|item| same_folder(item, &root))
    {
        settings.coding.trusted_folders.push(root.clone());
    }
    settings.coding.last_workspace = Some(root);
    save(app, &settings)?;
    Ok(settings)
}

pub fn untrust_folder(app: &AppHandle, root: &str) -> Result<AppSettings, String> {
    let mut settings = current(app)?;
    settings
        .coding
        .trusted_folders
        .retain(|item| !same_folder(item, root));
    save(app, &settings)?;
    Ok(settings)
}

pub fn set_api_enabled_flag(app: &AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = current(app)?;
    settings.api.enabled = enabled;
    save(app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_download_root(app: AppHandle, path: String) -> Result<AppSettings, String> {
    let root = normalize_root(&path);
    if root.is_empty() {
        return Err("Scegli una cartella.".into());
    }
    ensure_dir(&root)?;
    let mut settings = load_or_default(&app)?;
    settings.library.extra_roots.retain(|item| item != &root);
    settings.library.download_root = root;
    save(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn add_library_root(app: AppHandle, path: String) -> Result<AppSettings, String> {
    let root = normalize_root(&path);
    if root.is_empty() {
        return Err("Scegli una cartella.".into());
    }
    ensure_dir(&root)?;
    let mut settings = load_or_default(&app)?;
    if settings.library.download_root == root
        || settings.library.extra_roots.iter().any(|item| item == &root)
    {
        return Ok(settings);
    }
    settings.library.extra_roots.push(root);
    save(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn remove_library_root(app: AppHandle, path: String) -> Result<AppSettings, String> {
    let root = normalize_root(&path);
    let mut settings = load_or_default(&app)?;
    settings.library.extra_roots.retain(|item| item != &root);
    save(&app, &settings)?;
    Ok(settings)
}
