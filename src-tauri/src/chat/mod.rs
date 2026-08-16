//! Sessioni di chat persistenti. Lo streaming resta nel runtime.

mod types;

pub use types::{ChatMessage, ChatSession, ChatSnapshot};

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use types::{title_from, ChatStore};

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Non trovo la cartella dati: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Non creo la cartella dati: {e}"))?;
    Ok(dir.join("chats.json"))
}

fn load(app: &AppHandle) -> Result<ChatStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(ChatStore::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Non leggo le chat: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Chat danneggiate: {e}"))
}

fn save(app: &AppHandle, store: &ChatStore) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(store).map_err(|e| format!("Non preparo le chat: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Non salvo le chat: {e}"))
}

fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn new_id() -> String {
    format!("c{}", now_stamp())
}

fn sort_sessions(store: &mut ChatStore) {
    store
        .sessions
        .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
}

fn empty_session(model_id: Option<String>, model_name: Option<String>, variant_id: Option<String>) -> ChatSession {
    ChatSession {
        id: new_id(),
        title: "Nuova chat".into(),
        updated_at: now_stamp(),
        model_id,
        model_name,
        variant_id,
        archived: false,
        messages: Vec::new(),
    }
}

#[tauri::command]
pub fn list_chats(app: AppHandle) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    sort_sessions(&mut store);
    Ok(store.snapshot())
}

#[tauri::command]
pub fn create_chat(
    app: AppHandle,
    model_id: Option<String>,
    model_name: Option<String>,
    variant_id: Option<String>,
) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    let session = empty_session(model_id, model_name, variant_id);
    store.current_id = Some(session.id.clone());
    store.sessions.insert(0, session);
    save(&app, &store)?;
    Ok(store.snapshot())
}

#[tauri::command]
pub fn open_chat(app: AppHandle, id: String) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    if !store.sessions.iter().any(|item| item.id == id) {
        return Err("Questa conversazione non c’è più.".into());
    }
    store.current_id = Some(id);
    save(&app, &store)?;
    sort_sessions(&mut store);
    Ok(store.snapshot())
}

#[tauri::command]
pub fn delete_chat(app: AppHandle, id: String) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    store.sessions.retain(|item| item.id != id);
    if store.current_id.as_deref() == Some(id.as_str()) {
        store.current_id = store.sessions.first().map(|item| item.id.clone());
    }
    save(&app, &store)?;
    Ok(store.snapshot())
}

#[tauri::command]
pub fn archive_chat(app: AppHandle, id: String, archived: bool) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    let Some(session) = store.sessions.iter_mut().find(|item| item.id == id) else {
        return Err("Questa conversazione non c’è più.".into());
    };
    session.archived = archived;
    save(&app, &store)?;
    sort_sessions(&mut store);
    Ok(store.snapshot())
}

#[tauri::command]
pub fn save_chat_messages(
    app: AppHandle,
    id: Option<String>,
    messages: Vec<ChatMessage>,
    model_id: Option<String>,
    model_name: Option<String>,
    variant_id: Option<String>,
) -> Result<ChatSnapshot, String> {
    let mut store = load(&app)?;
    let first_user = messages
        .iter()
        .find(|item| item.role == "user" && !item.content.trim().is_empty())
        .map(|item| title_from(&item.content));

    if let Some(id) = id.as_deref() {
        if let Some(session) = store.sessions.iter_mut().find(|item| item.id == id) {
            session.messages = messages;
            session.updated_at = now_stamp();
            if let Some(title) = first_user {
                session.title = title;
            }
            if model_id.is_some() {
                session.model_id = model_id;
                session.model_name = model_name;
                session.variant_id = variant_id;
            }
            store.current_id = Some(id.to_string());
            sort_sessions(&mut store);
            save(&app, &store)?;
            return Ok(store.snapshot());
        }
    }

    let mut session = empty_session(model_id, model_name, variant_id);
    session.messages = messages;
    if let Some(title) = first_user {
        session.title = title;
    }
    store.current_id = Some(session.id.clone());
    store.sessions.insert(0, session);
    save(&app, &store)?;
    Ok(store.snapshot())
}
