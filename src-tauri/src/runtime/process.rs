use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use super::config::LaunchConfig;

const HEALTH_WAIT: Duration = Duration::from_secs(300);

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
            .arg(cfg.threads.to_string())
            .arg("--no-webui");
        if cfg.flash {
            command.arg("-fa").arg("on");
        }
        if let Some(cache) = &cfg.cache_type {
            command.arg("-ctk").arg(cache).arg("-ctv").arg(cache);
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
            thread::spawn(move || drain_pipe(pipe, None));
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

pub fn wait_ready(server: &mut ServerProcess) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/health", server.port);
    let client = reqwest::blocking::Client::builder()
        .user_agent("AInside/0.1 (desktop; Windows)")
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| format!("Non controllo il motore: {e}"))?;

    let started = Instant::now();
    loop {
        if !server.alive() {
            let detail = server.last_error();
            return Err(if detail.is_empty() {
                "Il motore si è chiuso durante l’avvio.".into()
            } else {
                detail
            });
        }
        if started.elapsed() > HEALTH_WAIT {
            return Err("Il modello ci ha messo troppo a entrare in memoria.".into());
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

fn drain_pipe<R: std::io::Read>(pipe: R, sink: Option<Arc<Mutex<String>>>) {
    let mut reader = BufReader::new(pipe);
    let mut line = String::new();
    while reader.read_line(&mut line).ok().is_some_and(|n| n > 0) {
        if let Some(sink) = &sink {
            if let Ok(mut text) = sink.lock() {
                text.push_str(&line);
                let extra = text.len().saturating_sub(8 * 1024);
                if extra > 0 {
                    text.drain(..extra);
                }
            }
        }
        line.clear();
    }
}
