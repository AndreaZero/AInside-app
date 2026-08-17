//! Adapter llama.cpp: processo ufficiale, niente engine proprietario.

mod coding;
mod config;
mod engine;
mod process;
mod stream;
mod types;

pub use stream::apply_thinking;
pub use types::{ChatTurn, RuntimeSnapshot, TokenChunk};

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::hardware;
use crate::library;
use crate::settings;

use config::{apply_expert, device_label, plan_with_reclaim, LaunchPlan, INTERNAL_PORT};
use engine::EngineKind;
use process::{
    display_log, format_elapsed, needs_newer_engine, port_in_use, wait_ready, ServerProcess,
};
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
    context_tokens: u32,
    reserved_ram: u64,
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
        inner.context_tokens = 0;
        inner.reserved_ram = 0;
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
    let profile = settings::profile(&app).ok();
    if current.phase == RuntimePhase::Pronto
        && current.variant_id.as_deref() == Some(&target.variant_id)
        && profile.is_some()
        && current.profile == profile
    {
        return Ok(current);
    }

    let (mut reclaim, prev_variant, had_server, previous) = {
        let mut inner = manager.inner.lock().expect("runtime lock");
        if inner.loading {
            return Ok(inner.snapshot.clone());
        }
        inner.loading = true;
        inner.cancel_load.store(false, Ordering::Relaxed);
        let had_server = inner.server.is_some();
        let previous = inner.server.take();
        let reclaim = inner.reserved_ram;
        inner.reserved_ram = 0;
        let prev_variant = inner.snapshot.variant_id.clone();
        let message = if had_server {
            "Libero la memoria dell’altro modello."
        } else {
            "Controllo la memoria libera."
        };
        inner.snapshot = Snapshot {
            model_name: Some(target.model_name.clone()),
            model_id: Some(target.model_id.clone()),
            variant_id: Some(target.variant_id.clone()),
            ..Snapshot::spento().with_phase(RuntimePhase::Motore, message)
        };
        (reclaim, prev_variant, had_server, previous)
    };
    let started = manager.snapshot();
    let _ = app.emit(EVENT, &started);

    if reclaim == 0 && had_server {
        if let Some(id) = prev_variant {
            if let Ok(library) = library::list_library(app.clone()) {
                if let Some(item) = library.items.iter().find(|item| item.variant_id == id) {
                    reclaim = fs::metadata(&item.path).map(|m| m.len()).unwrap_or(0);
                }
            }
        }
    }

    let app2 = app.clone();
    let mgr = manager.inner().clone();
    thread::spawn(move || {
        drop(previous);
        let result = load_inner(&app2, &mgr, target, reclaim);
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
pub fn start_coding_turn(
    app: AppHandle,
    manager: State<RuntimeManager>,
    messages: Vec<ChatTurn>,
    workspace: String,
    cited: Option<Vec<String>>,
) -> Result<RuntimeSnapshot, String> {
    let current = manager.snapshot();
    if current.phase != RuntimePhase::Pronto {
        return Err("Prima accendi il modello.".into());
    }
    if workspace.trim().is_empty() {
        return Err("Apri una cartella del progetto.".into());
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
            .with_phase(RuntimePhase::InRisposta, "Sto leggendo il progetto.");
    }
    let started = manager.snapshot();
    let _ = app.emit(EVENT, &started);

    let request = coding::CodingTurn {
        messages,
        workspace,
        cited: cited.unwrap_or_default(),
    };
    let app2 = app.clone();
    let mgr = manager.inner().clone();
    thread::spawn(move || {
        let (port, stop, context_tokens, model_name) = {
            let inner = mgr.inner.lock().expect("runtime lock");
            (
                inner
                    .server
                    .as_ref()
                    .map(|server| server.port)
                    .unwrap_or(INTERNAL_PORT),
                inner.stop.clone(),
                inner.context_tokens,
                inner.snapshot.model_name.clone(),
            )
        };
        let expert = settings::expert(&app2).unwrap_or_default();
        let thinking = settings::thinking_enabled(&app2);
        let mut sample = stream::SampleConfig::from_expert(&expert, thinking, model_name.as_deref());
        let context_tokens = if context_tokens == 0 { 4096 } else { context_tokens };
        coding::apply_coding_prompt(&mut sample, model_name.as_deref(), context_tokens);
        let result = coding::run(
            port,
            &request,
            &stop,
            &sample,
            context_tokens,
            |token| emit_token(&app2, token),
        );
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

fn load_inner(
    app: &AppHandle,
    manager: &RuntimeManager,
    target: ActiveTarget,
    reclaim: u64,
) -> Result<Snapshot, String> {
    let cancel = manager.inner.lock().expect("runtime lock").cancel_load.clone();
    if reclaim > 0 {
        manager.publish(
            app,
            Snapshot {
                model_name: Some(target.model_name.clone()),
                model_id: Some(target.model_id.clone()),
                variant_id: Some(target.variant_id.clone()),
                ..Snapshot::spento()
                    .with_phase(RuntimePhase::Motore, "Aspetto che la RAM dell’altro modello si liberi.")
            },
        );
        wait_ram_reclaim(reclaim, &cancel);
    }
    manager.publish(
        app,
        Snapshot {
            model_name: Some(target.model_name.clone()),
            model_id: Some(target.model_id.clone()),
            variant_id: Some(target.variant_id.clone()),
            ..Snapshot::spento().with_phase(RuntimePhase::Motore, "Controllo il file del modello.")
        },
    );

    let hardware = hardware::get_hardware();
    let kind = engine::choose_kind(&hardware);
    let profile = settings::profile(app)?;
    let weights = fs::metadata(&target.path).map(|m| m.len()).unwrap_or(0);
    let planned = apply_expert(
        plan_with_reclaim(&hardware, kind, profile, weights, reclaim)?,
        &settings::expert(app).unwrap_or_default(),
    );

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Non trovo la cartella dati: {e}"))?;

    let mut force = false;
    let mut last_err = String::new();
    for attempt in 0..2 {
        if cancel.load(Ordering::Relaxed) {
            return Err("Ho fermato l’avvio.".into());
        }
        let engine = engine::ensure(&app_data, &hardware, &cancel, force, |kind, got, total, message| {
            let mut snap = base_snapshot(&target, kind, false, &planned);
            snap.received_bytes = got;
            snap.expected_bytes = total;
            manager.publish(app, snap.with_phase(RuntimePhase::Motore, message));
        })?;

        match launch_server(app, manager, &target, &engine, &planned, &cancel, &app_data) {
            Ok(snapshot) => return Ok(snapshot),
            Err(err) if attempt == 0 && needs_newer_engine(&err) => {
                last_err = err;
                force = true;
                manager.publish(
                    app,
                    base_snapshot(&target, engine.kind, false, &planned).with_phase(
                        RuntimePhase::Motore,
                        "Questo modello serve un llama.cpp più recente. Lo scarico.",
                    ),
                );
            }
            Err(err) => return Err(explain_load_err(err)),
        }
    }
    Err(explain_load_err(last_err))
}

fn launch_server(
    app: &AppHandle,
    manager: &RuntimeManager,
    target: &ActiveTarget,
    engine: &engine::EngineSpec,
    planned: &LaunchPlan,
    cancel: &std::sync::atomic::AtomicBool,
    app_data: &Path,
) -> Result<Snapshot, String> {
    let mut cfg = planned.config.clone();
    let mut last_err = String::new();
    for offset in 0..10u16 {
        if cancel.load(Ordering::Relaxed) {
            return Err("Ho fermato l’avvio.".into());
        }
        cfg.port = INTERNAL_PORT + offset;
        manager.publish(
            app,
            base_snapshot(target, engine.kind, true, planned).with_phase(
                RuntimePhase::Avvio,
                format!("Carico {} in memoria · 0s", target.model_name),
            ),
        );
        match ServerProcess::spawn(&engine.exe, &target.path, &cfg) {
            Ok(mut server) => {
                match wait_ready(&mut server, cancel, |elapsed, log| {
                    let shown = display_log(log);
                    write_load_log(app_data, &shown);
                    manager.publish(
                        app,
                        base_snapshot(target, engine.kind, true, planned)
                            .with_phase(
                                RuntimePhase::Avvio,
                                format!(
                                    "Carico {} in memoria · {}",
                                    target.model_name,
                                    format_elapsed(elapsed)
                                ),
                            )
                            .with_log(shown),
                    );
                }) {
                    Ok(()) => {
                        let snapshot = base_snapshot(target, engine.kind, true, planned)
                            .with_phase(RuntimePhase::Pronto, planned.outcome.clone());
                        write_load_log(
                            app_data,
                            &format!("Pronto.\n{}", display_log(&server.last_error())),
                        );
                        let mut inner = manager.inner.lock().expect("runtime lock");
                        inner.server = Some(server);
                        inner.context_tokens = planned.config.context;
                        inner.reserved_ram = planned.ram_bytes;
                        return Ok(snapshot);
                    }
                    Err(err) => {
                        write_load_log(app_data, &display_log(&server.last_error()));
                        last_err = format!("{err} · {}", planned.detail);
                        drop(server);
                        if !port_in_use(&last_err) {
                            return Err(last_err);
                        }
                    }
                }
            }
            Err(err) => {
                last_err = format!("{err} · {}", planned.detail);
                if !port_in_use(&last_err) {
                    return Err(last_err);
                }
            }
        }
    }
    Err(last_err)
}

fn wait_ram_reclaim(reclaim: u64, cancel: &AtomicBool) {
    let baseline = hardware::get_hardware()
        .memory
        .available_bytes
        .unwrap_or(0);
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(2) {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_millis(150));
        let now = hardware::get_hardware()
            .memory
            .available_bytes
            .unwrap_or(0);
        if now.saturating_sub(baseline) >= reclaim / 4 {
            return;
        }
    }
}

fn explain_load_err(err: String) -> String {
    if needs_newer_engine(&err) {
        format!(
            "Questo modello è troppo nuovo per il motore locale. AInside prova ad aggiornare llama.cpp da solo; se resta così, il log sotto dice quale architettura manca.\n\n{err}"
        )
    } else {
        err
    }
}

fn write_load_log(app_data: &Path, text: &str) {
    let dir = app_data.join("runtime");
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(dir.join("last-load.log"), text);
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
        log: None,
        outcome: Some(plan.outcome.clone()),
        profile_label: Some(plan.profile.label_it().into()),
        profile: Some(plan.profile),
        phase: RuntimePhase::Spento,
        phase_label: types::phase_label(RuntimePhase::Spento).into(),
        message: String::new(),
    }
}
