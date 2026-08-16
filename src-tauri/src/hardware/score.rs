use serde::Serialize;

use super::types::{GpuInfo, HardwareReport};
use super::vendor::GpuVendor;

const GIB: u64 = 1024 * 1024 * 1024;
const MIN_USABLE_VRAM: u64 = 2 * GIB;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AiPerformance {
    Limited,
    Fair,
    Good,
    Great,
    Excellent,
}

impl AiPerformance {
    pub fn label_it(self) -> &'static str {
        match self {
            Self::Limited => "Limitate",
            Self::Fair => "Discrete",
            Self::Good => "Buone",
            Self::Great => "Ottime",
            Self::Excellent => "Eccellenti",
        }
    }

    pub fn note_it(self) -> &'static str {
        match self {
            Self::Excellent => {
                "Questo computer può far girare modelli grandi in locale, in modo fluido."
            }
            Self::Great => "Ottimo equilibrio: modelli medi e grandi starebbero comodi.",
            Self::Good => {
                "Puoi lavorare bene con modelli medi. I più grandi verranno adattati."
            }
            Self::Fair => "Meglio restare sui modelli leggeri: l’app sceglierà per te.",
            Self::Limited => {
                "Lo spazio è poco. Useremo solo modelli piccoli, per non appesantire il PC."
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct ScoreInput {
    pub vram_gb: Option<f64>,
    pub ram_gb: f64,
    pub cuda: bool,
    pub has_usable_gpu: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSummary {
    pub gpu_line: String,
    pub ram_line: String,
    pub cpu_line: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub hardware: HardwareReport,
    pub performance: AiPerformance,
    pub performance_label: String,
    pub summary: HardwareSummary,
}

pub fn build_profile(hardware: HardwareReport) -> HardwareProfile {
    let vram_bytes = usable_vram_bytes(&hardware.gpus);
    let ram_bytes = hardware.memory.total_bytes.unwrap_or(0);
    let input = ScoreInput {
        vram_gb: vram_bytes.map(bytes_to_gb),
        ram_gb: bytes_to_gb(ram_bytes),
        cuda: hardware.backends.cuda,
        has_usable_gpu: vram_bytes.is_some(),
    };
    let performance = evaluate(&input);

    HardwareProfile {
        summary: HardwareSummary {
            gpu_line: gpu_line(primary_gpu(&hardware.gpus), vram_bytes),
            ram_line: hardware
                .memory
                .total_bytes
                .map(format_gb)
                .unwrap_or_else(|| "Memoria non rilevata".into()),
            cpu_line: hardware
                .cpu
                .name
                .as_deref()
                .map(shorten_cpu)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Processore non rilevato".into()),
            note: performance.note_it().to_string(),
        },
        performance_label: performance.label_it().to_string(),
        performance,
        hardware,
    }
}

pub fn evaluate(input: &ScoreInput) -> AiPerformance {
    let ram = input.ram_gb;
    let vram = input.vram_gb.unwrap_or(0.0);

    if vram >= 16.0 || (vram >= 12.0 && ram >= 32.0 && input.cuda) {
        return AiPerformance::Excellent;
    }
    if vram >= 8.0 && ram >= 16.0 {
        return AiPerformance::Great;
    }
    if vram >= 6.0 || (vram >= 4.0 && ram >= 32.0) || (!input.has_usable_gpu && ram >= 64.0)
    {
        return AiPerformance::Good;
    }
    if ram >= 16.0 || vram >= 4.0 {
        return AiPerformance::Fair;
    }
    AiPerformance::Limited
}

pub fn bytes_to_gb(bytes: u64) -> f64 {
    let gb = bytes as f64 / GIB as f64;
    (gb * 2.0).round() / 2.0
}

pub fn format_gb(bytes: u64) -> String {
    let gb = bytes_to_gb(bytes);
    if (gb - gb.round()).abs() < 0.05 {
        format!("{} GB", gb.round() as u64)
    } else {
        format!("{gb:.1} GB")
    }
}

pub fn shorten_gpu(name: &str) -> String {
    name.replace("NVIDIA GeForce ", "")
        .replace("NVIDIA ", "")
        .replace("AMD Radeon RX ", "RX ")
        .replace("AMD Radeon ", "")
        .replace("AMD ", "")
        .replace("Intel(R) ", "")
        .replace("Intel ", "")
        .trim()
        .to_string()
}

pub fn shorten_cpu(name: &str) -> String {
    let cleaned = name
        .replace("AMD ", "")
        .replace("Intel(R) ", "")
        .replace("Intel ", "")
        .replace("Core(TM) ", "")
        .replace("CPU ", "")
        .replace(" Processor", "");
    let mut short = cleaned
        .split('@')
        .next()
        .unwrap_or(&cleaned)
        .trim()
        .to_string();
    if let Some(pos) = short.rfind("-Core") {
        if let Some(space) = short[..pos].rfind(' ') {
            if short[space + 1..pos].chars().all(|c| c.is_ascii_digit()) {
                short.truncate(space);
            }
        }
    }
    short.trim().to_string()
}

fn usable_vram_bytes(gpus: &[GpuInfo]) -> Option<u64> {
    gpus.iter()
        .filter_map(|gpu| gpu.vram_bytes)
        .filter(|&bytes| bytes >= MIN_USABLE_VRAM)
        .max()
}

fn primary_gpu(gpus: &[GpuInfo]) -> Option<&GpuInfo> {
    gpus.iter().max_by_key(|gpu| match gpu.vendor {
        GpuVendor::Nvidia => (3, gpu.vram_bytes.unwrap_or(0)),
        GpuVendor::Amd => (2, gpu.vram_bytes.unwrap_or(0)),
        GpuVendor::Intel => (1, gpu.vram_bytes.unwrap_or(0)),
        GpuVendor::Other => (0, gpu.vram_bytes.unwrap_or(0)),
    })
}

fn gpu_line(gpu: Option<&GpuInfo>, vram_bytes: Option<u64>) -> String {
    match (gpu, vram_bytes) {
        (Some(gpu), Some(vram)) => format!("{} — {}", shorten_gpu(&gpu.name), format_gb(vram)),
        (Some(gpu), None) => shorten_gpu(&gpu.name),
        (None, _) => "Nessuna scheda dedicata".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(vram: Option<f64>, ram: f64, cuda: bool, gpu: bool) -> ScoreInput {
        ScoreInput {
            vram_gb: vram,
            ram_gb: ram,
            cuda,
            has_usable_gpu: gpu,
        }
    }

    #[test]
    fn excellent_high_vram() {
        assert_eq!(
            evaluate(&input(Some(16.0), 16.0, true, true)),
            AiPerformance::Excellent
        );
    }

    #[test]
    fn excellent_4070_class() {
        assert_eq!(
            evaluate(&input(Some(12.0), 32.0, true, true)),
            AiPerformance::Excellent
        );
    }

    #[test]
    fn great_8gb() {
        assert_eq!(
            evaluate(&input(Some(8.0), 16.0, true, true)),
            AiPerformance::Great
        );
    }

    #[test]
    fn good_6gb() {
        assert_eq!(
            evaluate(&input(Some(6.0), 16.0, true, true)),
            AiPerformance::Good
        );
    }

    #[test]
    fn good_cpu_only_64() {
        assert_eq!(
            evaluate(&input(None, 64.0, false, false)),
            AiPerformance::Good
        );
    }

    #[test]
    fn fair_16_ram_no_gpu() {
        assert_eq!(
            evaluate(&input(None, 16.0, false, false)),
            AiPerformance::Fair
        );
    }

    #[test]
    fn limited_8_ram() {
        assert_eq!(
            evaluate(&input(None, 8.0, false, false)),
            AiPerformance::Limited
        );
    }

    #[test]
    fn formats_whole_and_half_gb() {
        assert_eq!(format_gb(12 * GIB), "12 GB");
        assert_eq!(format_gb((11.5 * GIB as f64) as u64), "11.5 GB");
    }

    #[test]
    fn shortens_common_names() {
        assert_eq!(shorten_gpu("NVIDIA GeForce RTX 4070"), "RTX 4070");
        assert_eq!(
            shorten_cpu("AMD Ryzen 7 7800X3D 8-Core Processor"),
            "Ryzen 7 7800X3D"
        );
    }
}
