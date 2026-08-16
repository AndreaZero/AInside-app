//! Server locale opzionale compatibile con l’API OpenAI.

mod server;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::settings;

use server::{BIND, PUBLIC_URL};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiStatus {
    pub enabled: bool,
    pub listening: bool,
    pub url: String,
    pub message: String,
    pub error_detail: Option<String>,
}

#[derive(Clone, Default)]
pub struct ApiHub {
    inner: Arc<Mutex<HubInner>>,
}

struct HubInner {
    stop: Arc<AtomicBool>,
    listening: bool,
    error: Option<String>,
}

impl Default for HubInner {
    fn default() -> Self {
        Self {
            stop: Arc::new(AtomicBool::new(false)),
            listening: false,
            error: None,
        }
    }
}

impl ApiHub {
    pub fn status(&self, enabled: bool) -> ApiStatus {
        let inner = self.inner.lock().expect("api lock");
        let listening = enabled && inner.listening;
        let error_detail = inner.error.clone();
        let message = if !enabled {
            "Spenta. Cursor e gli altri programmi non possono entrare.".into()
        } else if listening {
            format!("In ascolto su {PUBLIC_URL}. Accendi il modello in Chat prima di chiedere.")
        } else if let Some(detail) = &error_detail {
            detail.clone()
        } else {
            "Sto aprendo la porta locale.".into()
        };
        ApiStatus {
            enabled,
            listening,
            url: PUBLIC_URL.into(),
            message,
            error_detail,
        }
    }

    pub fn start(&self, app: &AppHandle) -> ApiStatus {
        self.stop_and_wait();
        let server = match tiny_http::Server::http(BIND) {
            Ok(server) => server,
            Err(error) => {
                let mut inner = self.inner.lock().expect("api lock");
                inner.listening = false;
                inner.error = Some(format!(
                    "La porta 11435 è occupata o non si apre. Chiudi l’altro programma e riprova. ({error})"
                ));
                return self.status(true);
            }
        };

        let stop = Arc::new(AtomicBool::new(false));
        {
            let mut inner = self.inner.lock().expect("api lock");
            inner.stop = stop.clone();
            inner.listening = true;
            inner.error = None;
        }

        let app = app.clone();
        let hub = self.clone();
        thread::spawn(move || {
            server::serve(server, &stop, &app);
            let mut inner = hub.inner.lock().expect("api lock");
            inner.listening = false;
        });
        self.status(true)
    }

    pub fn stop_and_wait(&self) {
        let stop = {
            let inner = self.inner.lock().expect("api lock");
            inner.stop.clone()
        };
        stop.store(true, Ordering::Relaxed);
        for _ in 0..15 {
            if !self.inner.lock().expect("api lock").listening {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let mut inner = self.inner.lock().expect("api lock");
        inner.listening = false;
        inner.error = None;
        inner.stop = Arc::new(AtomicBool::new(false));
    }

    pub fn shutdown(&self) {
        self.stop_and_wait();
    }
}

#[tauri::command]
pub fn get_api_status(app: AppHandle, hub: State<ApiHub>) -> ApiStatus {
    let enabled = settings::current(&app)
        .map(|settings| settings.api.enabled)
        .unwrap_or(false);
    hub.status(enabled)
}

#[tauri::command]
pub fn set_api_enabled(
    app: AppHandle,
    hub: State<ApiHub>,
    enabled: bool,
) -> Result<ApiStatus, String> {
    settings::set_api_enabled_flag(&app, enabled)?;
    if enabled {
        Ok(hub.start(&app))
    } else {
        hub.stop_and_wait();
        Ok(hub.status(false))
    }
}
