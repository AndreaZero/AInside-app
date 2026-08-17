//! Stima memoria e adatta context → batch → offload. I profili cambiano quanto del PC usiamo.

use crate::hardware::HardwareReport;
use crate::settings::{ExpertSettings, PerfProfile};

use super::engine::EngineKind;

const GIB: u64 = 1024 * 1024 * 1024;
const MIB: u64 = 1024 * 1024;
pub const INTERNAL_PORT: u16 = 18790;
const MIN_CONTEXT: u32 = 1024;

#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub context: u32,
    pub batch: u32,
    pub gpu_layers: String,
    pub threads: u32,
    pub port: u16,
    pub flash: bool,
    pub cache_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LaunchPlan {
    pub config: LaunchConfig,
    pub profile: PerfProfile,
    pub outcome: String,
    pub detail: String,
    pub ram_bytes: u64,
}

pub fn plan(
    hardware: &HardwareReport,
    kind: EngineKind,
    profile: PerfProfile,
    weights: u64,
) -> Result<LaunchPlan, String> {
    plan_with_reclaim(hardware, kind, profile, weights, 0)
}

pub fn plan_with_reclaim(
    hardware: &HardwareReport,
    kind: EngineKind,
    profile: PerfProfile,
    weights: u64,
    reclaim: u64,
) -> Result<LaunchPlan, String> {
    if weights == 0 {
        return Err("Non misuro il file del modello.".into());
    }

    let budget = Budget::from_hardware(hardware, profile, reclaim, weights);
    let mut context = start_context(profile);
    let mut batch = start_batch(profile);
    let mut ngl: u32 = if kind == EngineKind::Cpu { 0 } else { 99 };
    let threads = thread_count(hardware, profile);

    for _ in 0..24 {
        let est = estimate(weights, context, batch, ngl, kind);
        if est.fits(&budget) {
            let config = LaunchConfig {
                context,
                batch,
                gpu_layers: ngl.to_string(),
                threads,
                port: INTERNAL_PORT,
                flash: false,
                cache_type: None,
            };
            return Ok(LaunchPlan {
                outcome: outcome_it(profile, kind, ngl, context, start_context(profile), &est, &budget),
                detail: format!(
                    "profilo={} context={} batch={} ngl={} thread={} ram~{} vram~{} liberi={} recupero={} mmap={}",
                    profile.label_it(),
                    context,
                    batch,
                    ngl,
                    threads,
                    human(est.ram),
                    human(est.vram),
                    human(budget.free),
                    human(reclaim),
                    human(weights),
                ),
                profile,
                config,
                ram_bytes: est.ram,
            });
        }

        if context > MIN_CONTEXT {
            context = next_context(context);
            continue;
        }
        if batch > 128 {
            batch = next_batch(batch);
            continue;
        }
        if ngl > 0 {
            ngl = next_ngl(ngl);
            continue;
        }
        break;
    }

    Err(refuse_msg(hardware, kind, profile, weights, reclaim, &budget))
}

pub fn apply_expert(mut plan: LaunchPlan, expert: &ExpertSettings) -> LaunchPlan {
    if !expert.enabled {
        return plan;
    }
    if let Some(context) = expert.context.filter(|&n| n >= 512) {
        plan.config.context = context;
    }
    if let Some(batch) = expert.batch.filter(|&n| n >= 32) {
        plan.config.batch = batch;
    }
    if let Some(threads) = expert.threads.filter(|&n| n >= 1) {
        plan.config.threads = threads;
    }
    if let Some(layers) = expert.gpu_layers {
        plan.config.gpu_layers = if layers < 0 {
            "99".into()
        } else {
            layers.to_string()
        };
    }
    if let Some(flash) = expert.flash_attention {
        plan.config.flash = flash;
    }
    if let Some(cache) = expert
        .kv_cache
        .as_deref()
        .map(str::trim)
        .filter(|value| matches!(*value, "f16" | "q8_0" | "q4_0"))
    {
        plan.config.cache_type = Some(cache.to_string());
    }
    plan.outcome = format!("{} · regolato da te.", plan.profile.label_it());
    plan.detail = format!("{} · expert", plan.detail);
    plan
}

fn refuse_msg(
    hardware: &HardwareReport,
    kind: EngineKind,
    profile: PerfProfile,
    weights: u64,
    reclaim: u64,
    budget: &Budget,
) -> String {
    let ngl = if kind == EngineKind::Cpu { 0 } else { 35 };
    let need = estimate(weights, MIN_CONTEXT, 128, ngl, kind);
    let total = hardware.memory.total_bytes.unwrap_or(0);
    let available = hardware.memory.available_bytes.unwrap_or(0);
    let other = if reclaim > 0 {
        format!(
            " Ho appena spento l’altro modello (~{}), quella RAM deve tornare al sistema.",
            human(reclaim)
        )
    } else {
        String::new()
    };
    format!(
        "Il file è {} e a stretto servono circa {} di RAM. Usabili {} su {} totali (Windows ne dà {} liberi ora; il file sul disco spesso risulta “occupato” in cache, ma llama.cpp lo rilegge da lì, non lo ricopia).{} Se Chrome o altri programmi tengono davvero la memoria, chiudili e riprova. Altrimenti Risparmio o un modello più piccolo. Profilo: {}.",
        human(weights),
        human(need.ram),
        human(budget.ram),
        human(total),
        human(available),
        other,
        profile.label_it(),
    )
}

pub fn device_label(kind: EngineKind) -> &'static str {
    match kind {
        EngineKind::Vulkan => "Scheda grafica",
        EngineKind::Cpu => "Processore",
    }
}

struct Budget {
    ram: u64,
    vram: u64,
    free: u64,
}

struct Estimate {
    ram: u64,
    vram: u64,
}

impl Estimate {
    fn fits(&self, budget: &Budget) -> bool {
        self.ram <= budget.ram && self.vram <= budget.vram
    }
}

impl Budget {
    fn from_hardware(
        hardware: &HardwareReport,
        profile: PerfProfile,
        reclaim: u64,
        mmap_file: u64,
    ) -> Self {
        let ram_total = hardware.memory.total_bytes.filter(|&b| b > 0).unwrap_or(8 * GIB);
        let available = hardware
            .memory
            .available_bytes
            .filter(|&b| b > 0)
            .unwrap_or(ram_total.saturating_mul(60) / 100);
        // GGUF file-backed: Windows tiene il download in cache e lo sottrae
        // ai “GB liberi”. llama.cpp fa mmap dello stesso file, non una seconda copia.
        // L’altro modello che spegniamo (reclaim) non si somma: è lo stesso slot.
        let ram_free = available
            .saturating_add(reclaim)
            .saturating_add(mmap_file)
            .min(ram_total.saturating_sub(GIB));
        let vram = hardware
            .gpus
            .iter()
            .filter_map(|gpu| gpu.vram_bytes)
            .max()
            .unwrap_or(0);

        let (ram_use, vram_use, leave) = match profile {
            PerfProfile::Risparmio => (48, 58, ram_total / 3),
            PerfProfile::Bilanciato => (62, 78, ram_total / 4),
            PerfProfile::Massime => (75, 90, ram_total / 6),
        };
        let leave = leave.max(2 * GIB);
        let by_profile = ram_total.saturating_mul(ram_use) / 100;
        let ram = by_profile
            .min(ram_free)
            .min(ram_total.saturating_sub(leave));
        let vram = vram.saturating_mul(vram_use) / 100;

        Self {
            ram,
            vram,
            free: ram_free,
        }
    }
}

fn estimate(weights: u64, context: u32, batch: u32, ngl: u32, kind: EngineKind) -> Estimate {
    let kv = kv_bytes(weights, context);
    let batch_mem = (batch as u64)
        .saturating_mul(2 * MIB)
        .max(64 * MIB);
    let ram_overhead = 1400 * MIB;
    let vram_overhead = 768 * MIB;

    if kind == EngineKind::Cpu || ngl == 0 {
        return Estimate {
            ram: weights
                .saturating_add(kv)
                .saturating_add(batch_mem)
                .saturating_add(ram_overhead),
            vram: 0,
        };
    }

    let frac = ngl.min(99) as u64;
    let w_gpu = weights.saturating_mul(frac) / 100;
    let w_cpu = weights.saturating_sub(w_gpu);
    let kv_gpu = kv.saturating_mul(frac) / 100;
    let kv_cpu = kv.saturating_sub(kv_gpu);

    Estimate {
        ram: w_cpu
            .saturating_add(kv_cpu)
            .saturating_add(batch_mem)
            .saturating_add(ram_overhead),
        vram: w_gpu
            .saturating_add(kv_gpu)
            .saturating_add(vram_overhead),
    }
}

fn kv_bytes(weights: u64, context: u32) -> u64 {
    let at_4k = (weights / 12).clamp(192 * MIB, 3 * GIB);
    at_4k.saturating_mul(context as u64) / 4096
}

fn start_context(profile: PerfProfile) -> u32 {
    match profile {
        PerfProfile::Risparmio => 2048,
        PerfProfile::Bilanciato => 4096,
        PerfProfile::Massime => 8192,
    }
}

fn start_batch(profile: PerfProfile) -> u32 {
    match profile {
        PerfProfile::Risparmio => 256,
        PerfProfile::Bilanciato => 512,
        PerfProfile::Massime => 1024,
    }
}

fn next_context(context: u32) -> u32 {
    match context {
        n if n > 4096 => 4096,
        n if n > 2048 => 2048,
        _ => MIN_CONTEXT,
    }
}

fn next_batch(batch: u32) -> u32 {
    match batch {
        n if n > 512 => 512,
        n if n > 256 => 256,
        _ => 128,
    }
}

fn next_ngl(ngl: u32) -> u32 {
    match ngl {
        n if n > 60 => 60,
        n if n > 35 => 35,
        _ => 0,
    }
}

fn thread_count(hardware: &HardwareReport, profile: PerfProfile) -> u32 {
    let n = hardware.cpu.threads.or(hardware.cpu.cores).unwrap_or(4);
    match profile {
        PerfProfile::Risparmio => (n / 2).max(1),
        PerfProfile::Bilanciato | PerfProfile::Massime => n.saturating_sub(1).max(1),
    }
}

fn outcome_it(
    profile: PerfProfile,
    kind: EngineKind,
    ngl: u32,
    context: u32,
    wanted: u32,
    est: &Estimate,
    budget: &Budget,
) -> String {
    let device = if kind == EngineKind::Cpu || ngl == 0 {
        "uso il processore"
    } else if ngl >= 99 {
        "uso la scheda"
    } else {
        "divido tra scheda e processore"
    };

    let room = budget.ram.saturating_sub(est.ram) + budget.vram.saturating_sub(est.vram);
    let comfort = if context < wanted {
        "ho accorciato la memoria di lavoro, così non satura"
    } else if room > 4 * GIB {
        "sta comodo"
    } else if room > GIB {
        "sta, senza esagerare"
    } else {
        "sta stretto, ma dovrebbe reggere"
    };

    format!("{} · {} · {}.", profile.label_it(), comfort, device)
}

fn human(bytes: u64) -> String {
    format!("{:.1}GiB", bytes as f64 / GIB as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::{Backends, CpuInfo, DiskInfo, GpuInfo, MemoryInfo, OsInfo, GpuVendor};

    fn hw(ram_gib: u64, vram_gib: u64, threads: u32, vulkan: bool) -> HardwareReport {
        HardwareReport {
            os: OsInfo {
                name: Some("Windows".into()),
                version: None,
                arch: "x86_64".into(),
            },
            cpu: CpuInfo {
                name: Some("CPU".into()),
                cores: Some(8),
                threads: Some(threads),
            },
            memory: MemoryInfo {
                total_bytes: Some(ram_gib * GIB),
                available_bytes: Some(ram_gib.saturating_mul(70) / 100 * GIB),
            },
            gpus: if vram_gib == 0 {
                vec![]
            } else {
                vec![GpuInfo {
                    name: "GPU".into(),
                    vendor: GpuVendor::Nvidia,
                    vram_bytes: Some(vram_gib * GIB),
                    index: 0,
                }]
            },
            disk: DiskInfo {
                path: None,
                total_bytes: None,
                available_bytes: None,
            },
            backends: Backends {
                cuda: vulkan,
                vulkan,
                cpu: true,
            },
        }
    }

    #[test]
    fn balanced_uses_gpu_on_a_comfortable_pc() {
        let plan = plan(
            &hw(32, 12, 16, true),
            EngineKind::Vulkan,
            PerfProfile::Bilanciato,
            6 * GIB,
        )
        .unwrap();
        assert_eq!(plan.config.gpu_layers, "99");
        assert_eq!(plan.config.context, 4096);
        assert_eq!(plan.config.threads, 15);
        assert!(plan.outcome.contains("scheda"));
    }

    #[test]
    fn saver_keeps_a_smaller_context() {
        let machine = hw(32, 12, 16, true);
        let save = plan(&machine, EngineKind::Vulkan, PerfProfile::Risparmio, 6 * GIB).unwrap();
        let max = plan(&machine, EngineKind::Vulkan, PerfProfile::Massime, 6 * GIB).unwrap();
        assert!(save.config.context < max.config.context);
        assert!(save.config.threads < max.config.threads);
    }

    #[test]
    fn shrinks_context_before_offload() {
        let plan = plan(
            &hw(32, 12, 16, true),
            EngineKind::Vulkan,
            PerfProfile::Massime,
            8 * GIB,
        )
        .unwrap();
        assert_eq!(plan.config.gpu_layers, "99");
        assert!(plan.config.context < 8192);
    }

    #[test]
    fn cpu_never_offloads() {
        let plan = plan(
            &hw(32, 0, 8, false),
            EngineKind::Cpu,
            PerfProfile::Bilanciato,
            3 * GIB,
        )
        .unwrap();
        assert_eq!(plan.config.gpu_layers, "0");
        assert!(plan.outcome.contains("processore"));
    }

    #[test]
    fn refuses_when_the_file_cannot_fit() {
        let err = plan(
            &hw(8, 0, 8, false),
            EngineKind::Cpu,
            PerfProfile::Massime,
            10 * GIB,
        )
        .unwrap_err();
        assert!(err.contains("servono circa") || err.contains("non sta"));
        assert!(err.contains("8") || err.contains("RAM"));
    }

    #[test]
    fn cached_gguf_is_not_counted_twice() {
        let mut machine = hw(32, 12, 16, true);
        machine.memory.available_bytes = Some((7 * GIB) + (100 * MIB));
        let plan = plan(
            &machine,
            EngineKind::Vulkan,
            PerfProfile::Bilanciato,
            16 * GIB,
        );
        assert!(
            plan.is_ok(),
            "32 GB, file 16 GB già in cache, 7 GB “liberi”: deve partire. {:?}",
            plan.err()
        );
    }

    #[test]
    fn reclaim_helps_when_the_next_file_is_small() {
        let mut machine = hw(32, 12, 16, true);
        machine.memory.available_bytes = Some(2 * GIB);
        let ok = plan_with_reclaim(
            &machine,
            EngineKind::Vulkan,
            PerfProfile::Bilanciato,
            5 * GIB,
            8 * GIB,
        );
        assert!(ok.is_ok(), "{:?}", ok.err());
    }

    #[test]
    fn expert_off_leaves_the_plan() {
        let planned = plan(
            &hw(32, 12, 16, true),
            EngineKind::Vulkan,
            PerfProfile::Bilanciato,
            6 * GIB,
        )
        .unwrap();
        let same = apply_expert(planned.clone(), &ExpertSettings::default());
        assert_eq!(same.config.context, planned.config.context);
        assert!(!same.outcome.contains("regolato da te"));
    }

    #[test]
    fn expert_on_overrides_context() {
        let planned = plan(
            &hw(32, 12, 16, true),
            EngineKind::Vulkan,
            PerfProfile::Bilanciato,
            6 * GIB,
        )
        .unwrap();
        let expert = ExpertSettings {
            enabled: true,
            context: Some(2048),
            ..ExpertSettings::default()
        };
        let next = apply_expert(planned, &expert);
        assert_eq!(next.config.context, 2048);
        assert!(next.outcome.contains("regolato da te"));
    }
}
