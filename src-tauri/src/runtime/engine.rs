//! Motore llama.cpp ufficiale: zip da GitHub, non un engine nostro.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use zip::ZipArchive;

use crate::hardware::HardwareReport;

const USER_AGENT: &str = "AInside/0.1 (desktop; Windows)";
const RELEASES_API: &str = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
/// Qwen 3.8 (`qwen35`) e i GGUF del catalogo 2026-08 richiedono almeno b10355.
const MIN_ENGINE_BUILD: u32 = 10355;
const FALLBACK_TAG: &str = "b10456";
const FALLBACK_VULKAN: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10456/llama-b10456-bin-win-vulkan-x64.zip";
const FALLBACK_CPU: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10456/llama-b10456-bin-win-cpu-x64.zip";
const FALLBACK_CPU_ARM: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10456/llama-b10456-bin-win-cpu-arm64.zip";
const TAG_FILE: &str = "engine.tag";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineKind {
    Vulkan,
    Cpu,
}

impl EngineKind {
    pub fn folder(self) -> &'static str {
        match self {
            Self::Vulkan => "vulkan",
            Self::Cpu => "cpu",
        }
    }

    fn asset_needle(self, arch: &str) -> &'static str {
        match (self, arch) {
            (Self::Vulkan, _) => "bin-win-vulkan-x64.zip",
            (Self::Cpu, "aarch64" | "arm64") => "bin-win-cpu-arm64.zip",
            (Self::Cpu, _) => "bin-win-cpu-x64.zip",
        }
    }
}

#[derive(Debug, Clone)]
pub struct EngineSpec {
    pub kind: EngineKind,
    pub exe: PathBuf,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub fn choose_kind(hardware: &HardwareReport) -> EngineKind {
    if hardware.backends.vulkan {
        EngineKind::Vulkan
    } else {
        EngineKind::Cpu
    }
}

pub fn runtime_root(app_data: &Path) -> PathBuf {
    app_data.join("runtime")
}

pub fn ensure(
    app_data: &Path,
    hardware: &HardwareReport,
    cancel: &std::sync::atomic::AtomicBool,
    force: bool,
    mut on_progress: impl FnMut(EngineKind, u64, u64, &str),
) -> Result<EngineSpec, String> {
    let kind = choose_kind(hardware);
    let dir = runtime_root(app_data).join(kind.folder());
    fs::create_dir_all(&dir).map_err(|e| format!("Non creo la cartella del motore: {e}"))?;

    if !force {
        if let Some(exe) = find_server(&dir) {
            if engine_is_current(&dir) {
                on_progress(kind, 1, 1, "Motore già sul disco.");
                return Ok(EngineSpec { kind, exe });
            }
            on_progress(
                kind,
                0,
                0,
                "Il motore sul disco è vecchio per i modelli nuovi. Lo aggiorno.",
            );
        }
    } else {
        on_progress(kind, 0, 0, "Scarico un motore llama.cpp più recente.");
    }

    on_progress(kind, 0, 0, "Cerco il motore ufficiale llama.cpp.");
    let (url, expected, tag) = resolve_url(kind, &hardware.os.arch)?;
    on_progress(kind, 0, expected, "Prendo il motore ufficiale di llama.cpp.");
    let zip_path = dir.join("engine.zip");
    download_zip(&url, &zip_path, expected, cancel, |got| {
        on_progress(kind, got, expected, "Scarico il motore locale.");
    })?;
    on_progress(kind, expected.max(1), expected.max(1), "Apro il motore.");
    clear_engine_dir(&dir)?;
    unzip(&zip_path, &dir)?;
    let _ = fs::remove_file(&zip_path);
    write_tag(&dir, &tag);

    let exe = find_server(&dir).ok_or_else(|| {
        "Ho scaricato il motore ma non trovo il programma di avvio.".to_string()
    })?;
    Ok(EngineSpec { kind, exe })
}

fn resolve_url(kind: EngineKind, arch: &str) -> Result<(String, u64, String), String> {
    match fetch_latest(kind, arch) {
        Ok(found) if parse_build(&found.2).unwrap_or(0) >= MIN_ENGINE_BUILD => Ok(found),
        _ => Ok((
            fallback_url(kind, arch).to_string(),
            0,
            FALLBACK_TAG.to_string(),
        )),
    }
}

fn fetch_latest(kind: EngineKind, arch: &str) -> Result<(String, u64, String), String> {
    let client = api_client()?;
    let raw = client
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(rete)?
        .error_for_status()
        .map_err(rete)?
        .text()
        .map_err(rete)?;
    let release: GithubRelease =
        serde_json::from_str(&raw).map_err(|e| format!("Elenco motori illeggibile: {e}"))?;
    let needle = kind.asset_needle(arch);
    let asset = pick_asset(&release.assets, needle)
        .ok_or_else(|| format!("Nessun pacchetto {} in {}.", needle, release.tag_name))?;
    if !allowed_url(&asset.browser_download_url) {
        return Err("L’indirizzo del motore non è quello ufficiale.".into());
    }
    Ok((
        asset.browser_download_url.clone(),
        asset.size,
        release.tag_name,
    ))
}

fn pick_asset<'a>(assets: &'a [GithubAsset], needle: &str) -> Option<&'a GithubAsset> {
    assets.iter().find(|asset| {
        asset.name.ends_with(needle) && !asset.name.contains("hip") && !asset.name.contains("opencl")
    })
}

fn fallback_url(kind: EngineKind, arch: &str) -> &'static str {
    match (kind, arch) {
        (EngineKind::Vulkan, _) => FALLBACK_VULKAN,
        (EngineKind::Cpu, "aarch64" | "arm64") => FALLBACK_CPU_ARM,
        (EngineKind::Cpu, _) => FALLBACK_CPU,
    }
}

fn allowed_url(url: &str) -> bool {
    url.starts_with("https://github.com/ggml-org/llama.cpp/releases/download/")
}

fn download_zip(
    url: &str,
    dest: &Path,
    expected: u64,
    cancel: &std::sync::atomic::AtomicBool,
    mut on_progress: impl FnMut(u64),
) -> Result<(), String> {
    if !allowed_url(url) {
        return Err("L’indirizzo del motore non è quello ufficiale.".into());
    }
    if dest.exists() {
        if expected == 0 || fs::metadata(dest).map(|m| m.len()).unwrap_or(0) == expected {
            return Ok(());
        }
        let _ = fs::remove_file(dest);
    }

    let client = download_client()?;
    let mut response = client.get(url).send().map_err(rete)?.error_for_status().map_err(rete)?;
    let total = expected.max(response.content_length().unwrap_or(0));
    let part = dest.with_extension("zip.part");
    let mut file = File::create(&part).map_err(|e| format!("Non creo il pacchetto: {e}"))?;
    let mut buf = [0u8; 64 * 1024];
    let mut written = 0u64;
    loop {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            drop(file);
            let _ = fs::remove_file(&part);
            return Err("Ho fermato il download del motore.".into());
        }
        let n = response
            .read(&mut buf)
            .map_err(|e| format!("Rete: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("Non scrivo il motore: {e}"))?;
        written += n as u64;
        on_progress(written);
        if total > 0 && written >= total {
            break;
        }
    }
    drop(file);
    fs::rename(&part, dest).map_err(|e| format!("Non chiudo il pacchetto: {e}"))?;
    let _ = (total, FALLBACK_TAG);
    Ok(())
}

fn unzip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| format!("Non apro il pacchetto: {e}"))?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("Pacchetto motore illeggibile: {e}"))?;
    for i in 0..zip.len() {
        let mut src = zip
            .by_index(i)
            .map_err(|e| format!("Pacchetto motore danneggiato: {e}"))?;
        let Some(rel) = src.enclosed_name() else {
            continue;
        };
        let out = dest.join(rel);
        if src.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("Non apro la cartella del motore: {e}"))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Non apro la cartella del motore: {e}"))?;
        }
        let mut dst = File::create(&out).map_err(|e| format!("Non estraggo il motore: {e}"))?;
        std::io::copy(&mut src, &mut dst).map_err(|e| format!("Non estraggo il motore: {e}"))?;
    }
    Ok(())
}

fn find_server(dir: &Path) -> Option<PathBuf> {
    let names = ["llama-server.exe", "llama-server"];
    let mut stack = vec![(dir.to_path_buf(), 0u8)];
    while let Some((cur, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&cur) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            if path.is_file() && names.iter().any(|want| name.eq_ignore_ascii_case(want)) {
                return Some(path);
            }
            if path.is_dir() && depth < 3 {
                stack.push((path, depth + 1));
            }
        }
    }
    None
}

fn engine_is_current(dir: &Path) -> bool {
    parse_build(&read_tag(dir).unwrap_or_default()).unwrap_or(0) >= MIN_ENGINE_BUILD
}

fn read_tag(dir: &Path) -> Option<String> {
    fs::read_to_string(dir.join(TAG_FILE))
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn write_tag(dir: &Path, tag: &str) {
    let _ = fs::write(dir.join(TAG_FILE), tag.trim());
}

pub(crate) fn parse_build(tag: &str) -> Option<u32> {
    tag.trim()
        .trim_start_matches(['b', 'B'])
        .parse::<u32>()
        .ok()
}

fn clear_engine_dir(dir: &Path) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        if name == "engine.zip" || name == "engine.zip.part" || name == TAG_FILE {
            continue;
        }
        let result = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        result.map_err(|e| format!("Non sostituisco il motore vecchio: {e}"))?;
    }
    Ok(())
}

fn api_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(rete)
}

fn download_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(16))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(rete)
}

fn rete(err: reqwest::Error) -> String {
    format!("Rete: {err}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_vulkan_when_present() {
        let mut hw = dummy_hw();
        hw.backends.vulkan = true;
        assert_eq!(choose_kind(&hw), EngineKind::Vulkan);
        hw.backends.vulkan = false;
        assert_eq!(choose_kind(&hw), EngineKind::Cpu);
    }

    #[test]
    fn picks_official_windows_zip() {
        let assets = vec![
            GithubAsset {
                name: "llama-b1-bin-win-hip-radeon-x64.zip".into(),
                browser_download_url: "https://example.com/hip".into(),
                size: 1,
            },
            GithubAsset {
                name: "llama-b1-bin-win-vulkan-x64.zip".into(),
                browser_download_url: "https://github.com/ggml-org/llama.cpp/releases/download/b1/llama-b1-bin-win-vulkan-x64.zip".into(),
                size: 10,
            },
        ];
        let asset = pick_asset(&assets, "bin-win-vulkan-x64.zip").unwrap();
        assert!(asset.name.contains("vulkan"));
        assert!(allowed_url(&asset.browser_download_url));
    }

    #[test]
    fn rejects_foreign_urls() {
        assert!(!allowed_url("https://evil.example/llama.zip"));
    }

    #[test]
    fn parses_llama_cpp_build() {
        assert_eq!(parse_build("b10456"), Some(10456));
        assert_eq!(parse_build("b10278"), Some(10278));
        assert!(parse_build("b10278").unwrap() < MIN_ENGINE_BUILD);
        assert!(parse_build("b10456").unwrap() >= MIN_ENGINE_BUILD);
        assert_eq!(parse_build("nope"), None);
    }

    fn dummy_hw() -> crate::hardware::HardwareReport {
        use crate::hardware::{Backends, CpuInfo, DiskInfo, MemoryInfo, OsInfo};
        crate::hardware::HardwareReport {
            os: OsInfo {
                name: None,
                version: None,
                arch: "x86_64".into(),
            },
            cpu: CpuInfo {
                name: None,
                cores: Some(4),
                threads: Some(8),
            },
            memory: MemoryInfo {
                total_bytes: None,
                available_bytes: None,
            },
            gpus: vec![],
            disk: DiskInfo {
                path: None,
                total_bytes: None,
                available_bytes: None,
            },
            backends: Backends {
                cuda: false,
                vulkan: false,
                cpu: true,
            },
        }
    }
}
