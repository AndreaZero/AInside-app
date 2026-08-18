//! Comandi nella cartella aperta: un processo, stream, stop.

use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::paths::resolve_inside;
use super::write::{can_write, grant_session, WorkspaceHub};
use crate::settings::{self, CodingWrite};

const CHUNK_EVENT: &str = "term-chunk";
const STATUS_EVENT: &str = "term-status";
const MAX_CMD: usize = 8000;
const MAX_LOG: usize = 512 * 1024;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn MultiByteToWideChar(
        codepage: u32,
        flags: u32,
        src: *const u8,
        srclen: i32,
        dst: *mut u16,
        dstlen: i32,
    ) -> i32;
}

#[derive(Clone, Default)]
pub struct TermHub {
    inner: Arc<Mutex<TermInner>>,
}

#[derive(Default)]
struct TermInner {
    child: Option<Child>,
    id: u64,
    killed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermChunk {
    pub id: u64,
    pub text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermStatus {
    pub id: u64,
    pub running: bool,
    pub command: String,
    pub code: Option<i32>,
    pub message: Option<String>,
}

impl TermHub {
    pub fn shutdown(&self) {
        stop_inner(&self.inner);
    }
}

fn stop_inner(inner: &Mutex<TermInner>) {
    let child = {
        let mut guard = inner.lock().expect("term lock");
        guard.killed = true;
        guard.child.take()
    };
    if let Some(mut child) = child {
        kill_tree(&mut child);
        let _ = child.wait();
    }
}

fn kill_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .status();
    }
    let _ = child.kill();
}

fn emit_chunk(app: &AppHandle, id: u64, text: String) {
    if text.is_empty() {
        return;
    }
    let _ = app.emit(CHUNK_EVENT, &TermChunk { id, text });
}

fn emit_status(app: &AppHandle, status: &TermStatus) {
    let _ = app.emit(STATUS_EVENT, status);
}

fn decode_charset(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    #[cfg(windows)]
    {
        decode_oem(bytes)
    }
    #[cfg(not(windows))]
    {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

#[cfg(windows)]
fn decode_oem(bytes: &[u8]) -> String {
    const CP_OEMCP: u32 = 1;
    unsafe {
        let need = MultiByteToWideChar(
            CP_OEMCP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if need <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        let mut wide = vec![0u16; need as usize];
        let wrote = MultiByteToWideChar(
            CP_OEMCP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide.as_mut_ptr(),
            need,
        );
        if wrote <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        String::from_utf16_lossy(&wide[..wrote as usize])
    }
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n")
        .split('\n')
        .map(|line| {
            let line = line.trim_end_matches('\r');
            match line.rfind('\r') {
                Some(index) => &line[index + 1..],
                None => line,
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_ansi(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1b {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            match bytes[i] {
                b'[' => {
                    i += 1;
                    while i < bytes.len() && !(0x40..=0x7e).contains(&bytes[i]) {
                        i += 1;
                    }
                    if i < bytes.len() {
                        i += 1;
                    }
                }
                b']' => {
                    i += 1;
                    while i < bytes.len() && bytes[i] != 0x07 && bytes[i] != 0x1b {
                        i += 1;
                    }
                    if i < bytes.len() && bytes[i] == 0x07 {
                        i += 1;
                    } else if i + 1 < bytes.len() && bytes[i] == 0x1b && bytes[i + 1] == b'\\' {
                        i += 2;
                    }
                }
                _ => i += 1,
            }
            continue;
        }
        if bytes[i] < 0x20 && bytes[i] != b'\n' && bytes[i] != b'\t' {
            i += 1;
            continue;
        }
        let rest = match std::str::from_utf8(&bytes[i..]) {
            Ok(rest) => rest,
            Err(err) => {
                i += err.valid_up_to().max(1);
                continue;
            }
        };
        let ch = rest.chars().next().unwrap_or('\u{fffd}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn decode(bytes: &[u8]) -> String {
    strip_ansi(&normalize_newlines(&decode_charset(bytes)))
}

fn take_emit(acc: &[u8]) -> (&[u8], &[u8]) {
    if let Some(at) = acc.iter().rposition(|byte| *byte == b'\n') {
        return (&acc[..=at], &acc[at + 1..]);
    }
    if acc.len() < 256 {
        return (&[], acc);
    }
    match std::str::from_utf8(acc) {
        Ok(_) => (acc, &[]),
        Err(err) if err.error_len().is_none() => {
            let valid = err.valid_up_to();
            if valid == 0 {
                (&[], acc)
            } else {
                (&acc[..valid], &acc[valid..])
            }
        }
        Err(_) => (acc, &[]),
    }
}

fn pump(app: AppHandle, id: u64, mut stream: impl Read, cap: Arc<Mutex<usize>>) {
    let mut buf = [0u8; 512];
    let mut acc = Vec::new();
    loop {
        let n = match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        {
            let mut total = cap.lock().expect("term cap");
            if *total >= MAX_LOG {
                if *total == MAX_LOG {
                    *total += 1;
                    drop(total);
                    emit_chunk(
                        &app,
                        id,
                        "\n[Il log è lungo: nascondo il resto.]\n".into(),
                    );
                }
                continue;
            }
            *total += n;
        }
        acc.extend_from_slice(&buf[..n]);
        let (emit, rest) = take_emit(&acc);
        if !emit.is_empty() {
            emit_chunk(&app, id, decode(emit));
        }
        acc = rest.to_vec();
    }
    if !acc.is_empty() {
        emit_chunk(&app, id, decode(&acc));
    }
}

fn apply_grant(
    app: &AppHandle,
    hub: &WorkspaceHub,
    root: &str,
    grant: Option<&str>,
) -> Result<(), String> {
    match grant {
        None => {
            if can_write(app, hub, root)? {
                Ok(())
            } else {
                Err("Serve il permesso per eseguire comandi qui.".into())
            }
        }
        Some("once") => Ok(()),
        Some("session") => {
            grant_session(hub, root);
            Ok(())
        }
        Some("folder") => {
            settings::trust_folder(app, root)?;
            grant_session(hub, root);
            Ok(())
        }
        Some("always") => {
            settings::set_coding_write(app, CodingWrite::Always)?;
            Ok(())
        }
        Some(_) => Err("Permesso non valido.".into()),
    }
}

fn build_command(cwd: &std::path::Path, raw: &str) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/d", "/c", raw])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        cmd.args(["-lc", raw])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }
}

#[tauri::command]
pub fn term_status(term: State<TermHub>) -> TermStatus {
    let inner = term.inner.lock().expect("term lock");
    TermStatus {
        id: inner.id,
        running: inner.child.is_some(),
        command: String::new(),
        code: None,
        message: None,
    }
}

#[tauri::command]
pub fn term_stop(app: AppHandle, term: State<TermHub>) -> TermStatus {
    let id = {
        let inner = term.inner.lock().expect("term lock");
        inner.id
    };
    stop_inner(&term.inner);
    let status = TermStatus {
        id,
        running: false,
        command: String::new(),
        code: None,
        message: Some("Comando interrotto.".into()),
    };
    emit_status(&app, &status);
    status
}

#[tauri::command]
pub fn term_run(
    app: AppHandle,
    hub: State<WorkspaceHub>,
    term: State<TermHub>,
    root: String,
    command: String,
    grant: Option<String>,
) -> Result<TermStatus, String> {
    let raw = command.trim();
    if raw.is_empty() {
        return Err("Scrivi un comando.".into());
    }
    if raw.len() > MAX_CMD {
        return Err("Questo comando è troppo lungo.".into());
    }
    if raw.contains('\0') {
        return Err("Comando non valido.".into());
    }
    if root.trim().is_empty() {
        return Err("Apri una cartella del progetto.".into());
    }
    let cwd = resolve_inside(std::path::Path::new(&root), "")?;
    apply_grant(&app, &hub, &root, grant.as_deref())?;
    let _ = settings::touch_workspace(&app, &root);

    {
        let inner = term.inner.lock().expect("term lock");
        if inner.child.is_some() {
            return Err("C’è già un comando in corso. Ferma prima.".into());
        }
    }

    let mut child = build_command(&cwd, raw)
        .spawn()
        .map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => {
                "Non trovo questo programma sul computer.".to_string()
            }
            _ => "Non riesco ad avviare il comando.".to_string(),
        })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Non riesco a leggere l’output.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Non riesco a leggere l’output.".to_string())?;

    let id = {
        let mut inner = term.inner.lock().expect("term lock");
        if inner.child.is_some() {
            drop(inner);
            kill_tree(&mut child);
            let _ = child.wait();
            return Err("C’è già un comando in corso. Ferma prima.".into());
        }
        inner.id = inner.id.wrapping_add(1).max(1);
        inner.killed = false;
        inner.child = Some(child);
        inner.id
    };

    let status = TermStatus {
        id,
        running: true,
        command: raw.to_string(),
        code: None,
        message: None,
    };
    emit_status(&app, &status);

    let cap = Arc::new(Mutex::new(0usize));
    let app_out = app.clone();
    let cap_out = cap.clone();
    thread::spawn(move || pump(app_out, id, stdout, cap_out));
    let app_err = app.clone();
    let cap_err = cap;
    thread::spawn(move || pump(app_err, id, stderr, cap_err));

    let hub = term.inner.clone();
    let app_wait = app;
    let command = raw.to_string();
    thread::spawn(move || {
        loop {
            let mut inner = hub.lock().expect("term lock");
            if inner.id != id {
                return;
            }
            if inner.killed && inner.child.is_none() {
                return;
            }
            let Some(child) = inner.child.as_mut() else {
                let killed = inner.killed;
                drop(inner);
                if !killed {
                    emit_status(
                        &app_wait,
                        &TermStatus {
                            id,
                            running: false,
                            command,
                            code: None,
                            message: Some("Comando interrotto.".into()),
                        },
                    );
                }
                return;
            };
            match child.try_wait() {
                Ok(Some(exit)) => {
                    inner.child = None;
                    let killed = inner.killed;
                    drop(inner);
                    if killed {
                        return;
                    }
                    let code = exit.code();
                    let message = if code == Some(0) {
                        Some("Fatto.".into())
                    } else if let Some(code) = code {
                        Some(format!("È uscito con codice {code}."))
                    } else {
                        Some("Il comando è finito.".into())
                    };
                    emit_status(
                        &app_wait,
                        &TermStatus {
                            id,
                            running: false,
                            command,
                            code,
                            message,
                        },
                    );
                    return;
                }
                Ok(None) => {
                    drop(inner);
                    thread::sleep(Duration::from_millis(40));
                }
                Err(_) => {
                    inner.child = None;
                    drop(inner);
                    emit_status(
                        &app_wait,
                        &TermStatus {
                            id,
                            running: false,
                            command,
                            code: None,
                            message: Some("Il comando si è interrotto.".into()),
                        },
                    );
                    return;
                }
            }
        }
    });

    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_strips_cr() {
        assert_eq!(decode(b"ciao\r\nmondo\r"), "ciao\nmondo");
    }

    #[test]
    fn decode_strips_color_codes() {
        assert_eq!(decode(b"\x1b[32mVITE\x1b[0m v8"), "VITE v8");
    }

    #[cfg(windows)]
    #[test]
    fn decode_oem_italian_accent() {
        let text = decode(b"unita\x85");
        assert!(
            text.contains('à') || text.contains("unita"),
            "atteso una à, ottenuto {text:?}"
        );
    }
}
