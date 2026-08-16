//! Adapter llama.cpp: processo ufficiale, niente engine proprietario.

mod config;
mod engine;
mod process;
mod stream;
mod types;

pub use stream::apply_thinking;
pub use types::{ChatTurn, RuntimeSnapshot, TokenChunk};

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::hardware;
use crate::library;
use crate::settings;

use config::{apply_expert, device_label, plan, LaunchPlan, INTERNAL_PORT};
use engine::EngineKind;
use process::{wait_ready, ServerProcess};
use types::{RuntimePhase, RuntimeSnapshot as Snapshot};

const EVENT: &str = "runtime-update";
const TOKEN_EVENT: &str = "runtime-token";

#[derive(Clone, Default)]
pub struct RuntimeManager {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Default)]
struct Inner {
    snapshot: Snapshot,
    server: Option<ServerProcess>,
    stop: Arc<AtomicBool>,
    cancel_load: Arc<AtomicBool>,
    loading: bool,
    generating: bool,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self::spento()
    }
}

impl RuntimeManager {
    fn snapshot(&self) -> Snapshot {
        self.inner.lock().expect("runtime lock").snapshot.clone()
    }

    fn publish(&self, app: &AppHandle, snapshot: Snapshot) -> Snapshot {
        {
            let mut inner = self.inner.lock().expect("runtime lock");
            inner.snapshot = snapshot.clone();
        }
        let _ = app.emit(EVENT, &snapshot);
        snapshot
    }

    fn set_loading(&self, value: bool) {
        self.inner.lock().expect("runtime lock").loading = value;
    }

    pub fn ready_port(&self) -> Option<u16> {
        let inner = self.inner.lock().expect("runtime lock");
        match inner.snapshot.phase {
            RuntimePhase::Pronto | RuntimePhase::InRisposta => {
                inner.server.as_ref().map(|server| server.port)
            }
            _ => None,
        }
    }

    pub fn ready_model_id(&self) -> Option<String> {
        let inner = self.inner.lock().expect("runtime lock");
        match inner.snapshot.phase {
            RuntimePhase::Pronto | RuntimePhase::InRisposta => inner.snapshot.model_id.clone(),
            _ => None,
        }
    }

    pub fn shutdown(&self) {
        let mut inner = self.inner.lock().expect("runtime lock");
        inner.cancel_load.store(true, Ordering::Relaxed);
        inner.stop.store(true, Ordering::Relaxed);
        inner.server = None;
        inner.loading = false;
        inner.generating = false;
        inner.snapshot = Snapshot::spento();
    }
}

fn emit_token(app: &AppHandle, text: &str) {
    let _ = app.emit(TOKEN_EVENT, &TokenChunk { text: text.into() });
}

#[tauri::command]
pub fn get_runtime(manager: State<RuntimeManager>) -> RuntimeSnapshot {
    manager.snapshot()
}

#[tauri::command]
pub fn load_runtime(app: AppHandle, manager: State<RuntimeManager>) -> Result<RuntimeSnapshot, String> {
    let current = manager.snapshot();
    if matches!(
        current.phase,
        RuntimePhase::Motore | RuntimePhase::Avvio | RuntimePhase::InRisposta
    ) {
        return Ok(current);
    }

    let target = active_model(&app)?;
    if current.phase == RuntimePhase::Pronto && current.variant_id.as_deref() == Some(&target.variant_id)
    {
        return Ok(current);
    }

    {
        let mut inner = manager.inner.lock().expect("runtime lock");
        if inner.loading {
            return Ok(inner.snapshot.clone());
        }
        inner.loading = true;
        inner.cancel_load.store(false, Ordering::Relaxed);
        inner.server = None;
        inner.snapshot = Snapshot {
            model_name: Some(target.model_name.clone()),
            model_id: Some(target.model_id.clone()),
            variant_id: Some(target.variant_id.clone()),
            ..Snapshot::spento().with_phase(RuntimePhase::Motore, "Preparo il motore locale.")
        };
    }
    let started = manager.snapshot();
    let _ = app.emit(EVENT, &started);

    let app2 = app.clone();
    let mgr = manager.inner().clone();
    thread::spawn(move || {
        let result = load_inner(&app2, &mgr, target);
        mgr.set_loading(false);
        match result {
            Ok(snapshot) => {
                let _ = mgr.publish(&app2, snapshot);
            }
            Err(err) => {
                let failed = mgr
                    .snapshot()
                    .with_error("Il modello non è partito.", err);
                let _ = mgr.publish(&app2, failed);
            }
        }
    });

    Ok(started)
}

#[tauri::command]
pub fn unload_runtime(app: AppHandle, manager: State<RuntimeManager>) -> RuntimeSnapshot {
    manager.shutdown();
    let snapshot = Snapshot::spento();
    manager.publish(&app, snapshot)
}

#[tauri::command]
pub fn start_completion(
    app: AppHandle,
    manager: State<RuntimeManager>,
    messages: Vec<ChatTurn>,
) -> Result<RuntimeSnapshot, String> {
    let current = manager.snapshot();
    if current.phase != RuntimePhase::Pronto {
        return Err("Prima accendi il modello.".into());
    }
    {
        let mut inner = manager.inner.lock().expect("runtime lock");
        if inner.generating {
            return Err("Sto già rispondendo.".into());
        }
        if inner.server.is_none() {
            return Err("Il motore non è acceso.".into());
        }
        inner.generating = true;
        inner.stop.store(false, Ordering::Relaxed);
        inner.snapshot = inner
            .snapshot
            .clone()
            .with_phase(RuntimePhase::InRisposta, "Sto scrivendo.");
    }
    let started = manager.snapshot();
    let _ = app.emit(EVENT, &started);

    let app2 = app.clone();
    let mgr = manager.inner().clone();
    thread::spawn(move || {
        let port = mgr
            .inner
            .lock()
            .expect("runtime lock")
            .server
            .as_ref()
            .map(|server| server.port)
            .unwrap_or(INTERNAL_PORT);
        let stop = mgr.inner.lock().expect("runtime lock").stop.clone();
        let expert = settings::expert(&app2).unwrap_or_default();
        let thinking = settings::thinking_enabled(&app2);
        let model_name = mgr
            .inner
            .lock()
            .expect("runtime lock")
            .snapshot
            .model_name
            .clone();
        let sample = stream::SampleConfig::from_expert(&expert, thinking, model_name.as_deref());
        let result = stream::complete(port, &messages, &stop, &sample, |token| {
            emit_token(&app2, token);
        });
        {
            let mut inner = mgr.inner.lock().expect("runtime lock");
            inner.generating = false;
            inner.snapshot = match result {
                Ok(()) => {
                    let message = inner
                        .snapshot
                        .outcome
                        .clone()
                        .unwrap_or_else(|| "Pronto in locale.".into());
                    inner.snapshot.clone().with_phase(RuntimePhase::Pronto, message)
                }
                Err(err) => inner
                    .snapshot
                    .clone()
                    .with_error("La risposta si è interrotta.", err),
            };
            let _ = app2.emit(EVENT, &inner.snapshot);
        }
    });

    Ok(started)
}

#[tauri::command]
pub fn stop_completion(app: AppHandle, manager: State<RuntimeManager>) -> RuntimeSnapshot {
    let mut inner = manager.inner.lock().expect("runtime lock");
    inner.stop.store(true, Ordering::Relaxed);
    if inner.snapshot.phase == RuntimePhase::InRisposta {
        inner.snapshot = inner
            .snapshot
            .clone()
            .with_phase(RuntimePhase::Pronto, "Ho fermato la risposta.");
    }
    let snapshot = inner.snapshot.clone();
    let _ = app.emit(EVENT, &snapshot);
    snapshot
}

struct ActiveTarget {
    model_id: String,
    model_name: String,
    variant_id: String,
    path: PathBuf,
}

fn active_model(app: &AppHandle) -> Result<ActiveTarget, String> {
    let settings = settings::current(app)?;
    let active = settings
        .active
        .ok_or_else(|| "Scegli un modello pronto sul disco.".to_string())?;
    let library = library::list_library(app.clone())?;
    let item = library
        .items
        .iter()
        .find(|item| item.variant_id == active.variant_id && item.active)
        .ok_or_else(|| "Questo modello non è più sul disco.".to_string())?;
    if item.status != crate::library::LibraryStatus::Pronto {
        return Err("Questo file non è pronto da usare.".into());
    }
    Ok(ActiveTarget {
        model_id: item.model_id.clone(),
        model_name: item.model_name.clone(),
        variant_id: item.variant_id.clone(),
        path: PathBuf::from(&item.path),
    })
}

fn load_inner(app: &AppHandle, manager: &RuntimeManager, target: ActiveTarget) -> Result<Snapshot, String> {
    let hardware = hardware::get_hardware();
    let profile = settings::profile(app)?;
    let weights = fs::metadata(&target.path).map(|m| m.len()).unwrap_or(0);
    let kind = engine::choose_kind(&hardware);
    let planned = apply_expert(
        plan(&hardware, kind, profile, weights)?,
        &settings::expert(app).unwrap_or_default(),
    );

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Non trovo la cartella dati: {e}"))?;
    let cancel = manager.inner.lock().expect("runtime lock").cancel_load.clone();

    let engine = engine::ensure(&app_data, &hardware, &cancel, |kind, got, total, message| {
        let mut snap = base_snapshot(&target, kind, false, &planned);
        snap.received_bytes = got;
        snap.expected_bytes = total;
        manager.publish(app, snap.with_phase(RuntimePhase::Motore, message));
    })?;

    if cancel.load(Ordering::Relaxed) {
        return Err("Ho fermato l’avvio.".into());
    }

    let mut cfg = planned.config.clone();
    let mut last_err = String::new();
    for offset in 0..10u16 {
        if cancel.load(Ordering::Relaxed) {
            return Err("Ho fermato l’avvio.".into());
        }
        cfg.port = INTERNAL_PORT + offset;
        manager.publish(
            app,
            base_snapshot(&target, engine.kind, true, &planned)
                .with_phase(RuntimePhase::Avvio, "Carico il modello in memoria."),
        );
        match ServerProcess::spawn(&engine.exe, &target.path, &cfg) {
            Ok(mut server) => match wait_ready(&mut server) {
                Ok(()) => {
                    let snapshot = base_snapshot(&target, engine.kind, true, &planned)
                        .with_phase(RuntimePhase::Pronto, planned.outcome.clone());
                    manager.inner.lock().expect("runtime lock").server = Some(server);
                    return Ok(snapshot);
                }
                Err(err) => {
                    last_err = format!("{err} · {}", planned.detail);
                    drop(server);
                }
            },
            Err(err) => last_err = format!("{err} · {}", planned.detail),
        }
    }
    Err(last_err)
}

fn base_snapshot(
    target: &ActiveTarget,
    kind: EngineKind,
    engine_ready: bool,
    plan: &LaunchPlan,
) -> Snapshot {
    Snapshot {
        model_name: Some(target.model_name.clone()),
        model_id: Some(target.model_id.clone()),
        variant_id: Some(target.variant_id.clone()),
        device_label: device_label(kind).into(),
        engine_ready,
        received_bytes: 0,
        expected_bytes: 0,
        error_detail: None,
        outcome: Some(plan.outcome.clone()),
        profile_label: Some(plan.profile.label_it().into()),
        profile: Some(plan.profile),
        phase: RuntimePhase::Spento,
        phase_label: types::phase_label(RuntimePhase::Spento).into(),
        message: String::new(),
    }
}
