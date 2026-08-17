use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use super::config::LaunchConfig;

const HEALTH_WAIT: Duration = Duration::from_secs(300);
const LOG_CAP: usize = 32 * 1024;

pub struct ServerProcess {
    child: Child,
    pub port: u16,
    stderr: Arc<Mutex<String>>,
}

impl ServerProcess {
    pub fn spawn(exe: &Path, model: &Path, cfg: &LaunchConfig) -> Result<Self, String> {
        if !exe.is_file() {
            return Err("Non trovo il motore locale.".into());
        }
        if !model.is_file() {
            return Err("Non trovo il file del modello.".into());
        }

        let mut command = Command::new(exe);
        command
            .current_dir(exe.parent().unwrap_or(exe))
            .arg("-m")
            .arg(model)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(cfg.port.to_string())
            .arg("-c")
            .arg(cfg.context.to_string())
            .arg("-b")
            .arg(cfg.batch.to_string())
            .arg("-ngl")
            .arg(&cfg.gpu_layers)
            .arg("-t")
            .arg(cfg.threads.to_string());
        for flag in extra_flags(cfg) {
            command.arg(flag);
        }
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("Non avvio il motore: {e}"))?;

        let stderr = Arc::new(Mutex::new(String::new()));
        if let Some(pipe) = child.stderr.take() {
            let sink = Arc::clone(&stderr);
            thread::spawn(move || drain_pipe(pipe, Some(sink)));
        }
        if let Some(pipe) = child.stdout.take() {
            let sink = Arc::clone(&stderr);
            thread::spawn(move || drain_pipe(pipe, Some(sink)));
        }

        Ok(Self {
            child,
            port: cfg.port,
            stderr,
        })
    }

    pub fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn last_error(&self) -> String {
        self.stderr
            .lock()
            .map(|text| text.trim().to_string())
            .unwrap_or_default()
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

pub(crate) fn extra_flags(cfg: &LaunchConfig) -> Vec<String> {
    let mut flags = vec!["--no-webui".into(), "--jinja".into()];
    if cfg.flash {
        flags.extend(["-fa".into(), "on".into()]);
    }
    if let Some(cache) = &cfg.cache_type {
        flags.extend(["-ctk".into(), cache.clone(), "-ctv".into(), cache.clone()]);
    }
    if cfg.mtp {
        flags.extend([
            "--spec-type".into(),
            "draft-mtp".into(),
            "--spec-draft-n-max".into(),
            "2".into(),
        ]);
    }
    flags
}

pub fn wait_ready(
    server: &mut ServerProcess,
    cancel: &AtomicBool,
    mut on_tick: impl FnMut(Duration, &str),
) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/health", server.port);
    let client = reqwest::blocking::Client::builder()
        .user_agent("AInside/0.1 (desktop; Windows)")
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| format!("Non controllo il motore: {e}"))?;

    let started = Instant::now();
    let mut last_tick = Instant::now() - Duration::from_secs(1);
    on_tick(Duration::ZERO, &server.last_error());

    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Ho fermato l’avvio.".into());
        }
        if !server.alive() {
            let detail = display_log(&server.last_error());
            return Err(if detail.is_empty() {
                "Il motore si è chiuso durante l’avvio.".into()
            } else {
                detail
            });
        }
        if started.elapsed() > HEALTH_WAIT {
            let detail = display_log(&server.last_error());
            return Err(if detail.is_empty() {
                format!(
                    "Il modello ci ha messo troppo a entrare in memoria ({}). Il motore non ha scritto nulla: spesso è un blocco della scheda grafica o un file troppo grande per questo PC.",
                    format_elapsed(started.elapsed())
                )
            } else {
                format!(
                    "Il modello ci ha messo troppo a entrare in memoria ({}).\n\n{detail}",
                    format_elapsed(started.elapsed())
                )
            });
        }

        if last_tick.elapsed() >= Duration::from_millis(900) {
            last_tick = Instant::now();
            on_tick(started.elapsed(), &server.last_error());
        }

        match client.get(&url).send() {
            Ok(response) => match response.status().as_u16() {
                200 => return Ok(()),
                503 => {}
                code => {
                    let body = response.text().unwrap_or_default();
                    if !body.is_empty() {
                        return Err(format!("Avvio rifiutato ({code}): {body}"));
                    }
                }
            },
            Err(_) => {}
        }
        thread::sleep(Duration::from_millis(400));
    }
}

pub(crate) fn format_elapsed(elapsed: Duration) -> String {
    let secs = elapsed.as_secs();
    if secs < 60 {
        format!("{secs}s")
    } else {
        format!("{}m {:02}s", secs / 60, secs % 60)
    }
}

pub(crate) fn needs_newer_engine(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    t.contains("unknown model architecture") || t.contains("unknown architecture")
}

pub(crate) fn port_in_use(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    t.contains("address already in use")
        || t.contains("only one usage of each socket")
        || t.contains("eaddrinuse")
        || t.contains("error 10048")
        || t.contains("(os error 10048)")
        || t.contains("wsaeaddrinuse")
}

pub(crate) fn display_log(text: &str) -> String {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let slice = if lines.len() > 24 {
        &lines[lines.len() - 24..]
    } else {
        &lines
    };
    let joined = slice.join("\n");
    if joined.len() <= 4000 {
        return joined;
    }
    let mut idx = joined.len().saturating_sub(4000);
    while idx < joined.len() && !joined.is_char_boundary(idx) {
        idx += 1;
    }
    format!("…{}", &joined[idx..])
}

fn drain_pipe<R: Read>(mut pipe: R, sink: Option<Arc<Mutex<String>>>) {
    let mut buf = [0u8; 2048];
    let mut leftover = Vec::new();
    loop {
        let n = match pipe.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        leftover.extend_from_slice(&buf[..n]);
        loop {
            let Some(pos) = leftover.iter().position(|&b| b == b'\n' || b == b'\r') else {
                break;
            };
            let mut line = leftover.drain(..=pos).collect::<Vec<_>>();
            let _ = line.pop();
            if line.last() == Some(&b'\r') {
                let _ = line.pop();
            }
            if line.is_empty() {
                continue;
            }
            append_log(&sink, &String::from_utf8_lossy(&line));
        }
        if leftover.len() > 8 * 1024 {
            leftover.drain(..leftover.len() - 4096);
        }
    }
    if !leftover.is_empty() {
        append_log(&sink, &String::from_utf8_lossy(&leftover));
    }
}

fn append_log(sink: &Option<Arc<Mutex<String>>>, chunk: &str) {
    let Some(sink) = sink else {
        return;
    };
    let Ok(mut text) = sink.lock() else {
        return;
    };
    text.push_str(chunk);
    text.push('\n');
    let extra = text.len().saturating_sub(LOG_CAP);
    if extra > 0 {
        text.drain(..extra);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_busy_port() {
        assert!(port_in_use("error: Address already in use"));
        assert!(port_in_use("Only one usage of each socket address is normally permitted. (os error 10048)"));
        assert!(!port_in_use("failed to load model"));
        assert!(needs_newer_engine(
            "error loading model: unknown model architecture: 'qwen35'"
        ));
        assert!(!needs_newer_engine("failed to allocate buffer"));
    }

    #[test]
    fn keeps_last_log_lines() {
        let log = (0..40).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let shown = display_log(&log);
        assert!(shown.contains("line 39"));
        assert!(!shown.contains("line 0"));
    }

    #[test]
    fn formats_wait() {
        assert_eq!(format_elapsed(Duration::from_secs(9)), "9s");
        assert_eq!(format_elapsed(Duration::from_secs(75)), "1m 15s");
    }

    #[test]
    fn gpu_flags_include_jinja_flash_and_mtp() {
        let cfg = crate::runtime::config::LaunchConfig {
            context: 4096,
            batch: 512,
            gpu_layers: "99".into(),
            threads: 8,
            port: 18790,
            flash: true,
            cache_type: Some("q8_0".into()),
            mtp: true,
        };
        let flags = extra_flags(&cfg);
        assert!(flags.iter().any(|flag| flag == "--jinja"));
        assert!(flags.windows(2).any(|pair| pair[0] == "-fa" && pair[1] == "on"));
        assert!(flags
            .windows(2)
            .any(|pair| pair[0] == "--spec-type" && pair[1] == "draft-mtp"));
        assert!(flags.windows(2).any(|pair| pair[0] == "-ctk" && pair[1] == "q8_0"));
    }
}
