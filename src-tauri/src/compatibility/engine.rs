//! Stima usabilità e variante. Usa solo i numeri del PC rilevato, mai un profilo fisso.

use crate::catalog::{CatalogFile, CatalogModel, GgufVariant};
use crate::hardware::{format_gb, HardwareReport};

use super::types::{FitLevel, ModelRecommendation, RecommendationSet, SpeedHint};

const GIB: u64 = 1024 * 1024 * 1024;
const MIB: u64 = 1024 * 1024;
const MIN_USABLE_VRAM: u64 = 2 * GIB;
const DISK_RESERVE: u64 = 2 * GIB;
const UNKNOWN_RAM: u64 = 8 * GIB;

#[derive(Debug, Clone)]
pub struct MachineBudget {
    pub vram: u64,
    pub ram_total: u64,
    pub ram_free: u64,
    pub disk_free: Option<u64>,
    pub has_gpu: bool,
}

impl MachineBudget {
    pub fn from_hardware(hw: &HardwareReport) -> Self {
        let vram = hw
            .gpus
            .iter()
            .filter_map(|gpu| gpu.vram_bytes)
            .filter(|&bytes| bytes >= MIN_USABLE_VRAM)
            .max()
            .unwrap_or(0);
        let ram_total = hw.memory.total_bytes.filter(|&b| b > 0).unwrap_or(UNKNOWN_RAM);
        let ram_free = hw
            .memory
            .available_bytes
            .filter(|&b| b > 0)
            .unwrap_or(ram_total.saturating_mul(60) / 100);
        let disk_free = hw.disk.available_bytes.filter(|&b| b > 0);

        Self {
            vram,
            ram_total,
            ram_free,
            disk_free,
            has_gpu: vram >= MIN_USABLE_VRAM,
        }
    }

    pub fn note_it(&self) -> String {
        if self.has_gpu {
            format!(
                "Su questo PC ({} in scheda, {} di memoria) mostriamo i modelli che stanno. Gli altri restano nel catalogo, nascosti.",
                format_gb(self.vram),
                format_gb(self.ram_total)
            )
        } else {
            format!(
                "Nessuna scheda dedicata utile. Con {} di memoria mostriamo solo i modelli piccoli, da far girare sul processore.",
                format_gb(self.ram_total)
            )
        }
    }
}

#[derive(Debug, Clone)]
struct VariantFit {
    variant: GgufVariant,
    fit: FitLevel,
    speed: SpeedHint,
}

pub fn recommend(catalog: &CatalogFile, hardware: &HardwareReport) -> RecommendationSet {
    let budget = MachineBudget::from_hardware(hardware);
    let mut picks = Vec::new();
    let mut hidden = 0u32;

    for model in &catalog.models {
        match recommend_model(model, &budget) {
            Some(pick) => picks.push(pick),
            None => hidden += 1,
        }
    }

    picks.sort_by(|a, b| {
        score_pick(b)
            .cmp(&score_pick(a))
            .then_with(|| a.model.name.cmp(&b.model.name))
    });

    RecommendationSet {
        updated_at: catalog.updated_at.clone(),
        source_note: catalog.source_note.clone(),
        machine_note: budget.note_it(),
        picks,
        hidden_count: hidden,
    }
}

fn recommend_model(model: &CatalogModel, budget: &MachineBudget) -> Option<ModelRecommendation> {
    let mut fits: Vec<VariantFit> = model
        .variants
        .iter()
        .filter_map(|variant| evaluate_variant(variant, budget))
        .collect();
    if fits.is_empty() {
        return None;
    }

    fits.sort_by(|a, b| {
        a.fit
            .cmp(&b.fit)
            .then_with(|| quant_pref(a.variant.quant.as_str()).cmp(&quant_pref(b.variant.quant.as_str())))
            .then_with(|| a.variant.size_bytes.cmp(&b.variant.size_bytes))
    });

    let chosen = pick_balanced(&fits, budget);
    let alternatives = fits
        .iter()
        .filter(|item| item.variant.id != chosen.variant.id)
        .map(|item| item.variant.clone())
        .collect();

    Some(ModelRecommendation {
        reason: reason_it(chosen.fit, chosen.speed, &chosen.variant),
        fit_label: chosen.fit.label_it().to_string(),
        speed_label: chosen.speed.label_it().to_string(),
        recommended: chosen.variant.clone(),
        alternatives,
        fit: chosen.fit,
        speed: chosen.speed,
        model: model.clone(),
    })
}

fn evaluate_variant(variant: &GgufVariant, budget: &MachineBudget) -> Option<VariantFit> {
    if let Some(disk) = budget.disk_free {
        if variant.size_bytes + DISK_RESERVE > disk {
            return None;
        }
    }

    let kv = kv_bytes(variant.size_bytes);
    let overhead = if budget.has_gpu { 1200 * MIB } else { 1800 * MIB };
    let weights = variant.size_bytes;

    if budget.has_gpu {
        let gpu_need = weights.saturating_add(kv / 2).saturating_add(800 * MIB);
        let headroom = (budget.vram / 6).max(3 * GIB / 2);
        if gpu_need.saturating_add(headroom) <= budget.vram {
            return Some(VariantFit {
                variant: variant.clone(),
                fit: FitLevel::Comodo,
                speed: SpeedHint::Veloce,
            });
        }

        let spill = weights.saturating_sub(budget.vram.saturating_mul(85) / 100);
        let ram_need = spill.saturating_add(kv).saturating_add(overhead);
        let ram_cap = budget.ram_free.min(budget.ram_total.saturating_mul(55) / 100);
        if ram_need + 3 * GIB <= ram_cap.max(budget.ram_free) && weights <= budget.vram + budget.ram_free / 2
        {
            return Some(VariantFit {
                variant: variant.clone(),
                fit: FitLevel::Ok,
                speed: SpeedHint::Buona,
            });
        }

        let tight_need = weights
            .saturating_add(kv / 2)
            .saturating_add(overhead);
        if tight_need <= budget.vram.saturating_add(budget.ram_free.saturating_mul(70) / 100) {
            return Some(VariantFit {
                variant: variant.clone(),
                fit: FitLevel::Stretto,
                speed: SpeedHint::Lenta,
            });
        }
        return None;
    }

    let need = weights.saturating_add(kv).saturating_add(overhead);
    let ram_cap = budget.ram_total.saturating_mul(55) / 100;
    if need + 2 * GIB <= budget.ram_free && need <= ram_cap {
        let fit = if weights < 3 * GIB {
            FitLevel::Ok
        } else {
            FitLevel::Stretto
        };
        return Some(VariantFit {
            variant: variant.clone(),
            fit,
            speed: SpeedHint::Lenta,
        });
    }
    None
}

fn pick_balanced<'a>(fits: &'a [VariantFit], budget: &MachineBudget) -> &'a VariantFit {
    let comodo: Vec<&VariantFit> = fits.iter().filter(|f| f.fit == FitLevel::Comodo).collect();
    let pool = if !comodo.is_empty() {
        comodo
    } else {
        let ok: Vec<&VariantFit> = fits.iter().filter(|f| f.fit == FitLevel::Ok).collect();
        if !ok.is_empty() {
            ok
        } else {
            fits.iter().collect()
        }
    };

    let leftover = if budget.has_gpu {
        budget.vram.saturating_sub(pool.iter().map(|f| f.variant.size_bytes).min().unwrap_or(0))
    } else {
        0
    };
    let target = if leftover >= 4 * GIB { 4 } else { 3 };

    pool.iter()
        .min_by_key(|item| {
            let tier = quant_tier(&item.variant.quant);
            let dist = (tier - target).unsigned_abs();
            (dist, item.variant.size_bytes)
        })
        .copied()
        .unwrap_or(&fits[0])
}

fn kv_bytes(weights: u64) -> u64 {
    (weights / 12).clamp(256 * MIB, 2500 * MIB)
}

fn quant_tier(quant: &str) -> i32 {
    let q = quant.to_ascii_uppercase();
    if q.contains("Q8") {
        6
    } else if q.contains("Q6") {
        5
    } else if q.contains("Q5") {
        4
    } else if q.contains("Q4_K_M") || q.contains("Q4_K_XL") || q.contains("IQ4") {
        3
    } else if q.contains("Q4") {
        2
    } else if q.contains("Q3") || q.contains("IQ3") {
        1
    } else {
        0
    }
}

fn quant_pref(quant: &str) -> i32 {
    quant_tier(quant)
}

fn score_pick(pick: &ModelRecommendation) -> i32 {
    let fit = match pick.fit {
        FitLevel::Comodo => 30,
        FitLevel::Ok => 16,
        FitLevel::Stretto => 4,
    };
    let speed = match pick.speed {
        SpeedHint::Veloce => 8,
        SpeedHint::Buona => 4,
        SpeedHint::Lenta => 0,
    };
    i32::from(pick.model.quality.overall) * 12 + fit + speed
}

fn reason_it(fit: FitLevel, speed: SpeedHint, variant: &GgufVariant) -> String {
    let size = format_gb(variant.size_bytes);
    match (fit, speed) {
        (FitLevel::Comodo, SpeedHint::Veloce) => format!(
            "Abbiamo scelto la versione da {size}: sta sulla scheda con margine, dovrebbe essere fluida."
        ),
        (FitLevel::Ok, SpeedHint::Buona) => format!(
            "Abbiamo scelto la versione da {size}: scheda e memoria insieme, senza saturare il computer."
        ),
        (FitLevel::Stretto, _) => format!(
            "Entra la versione da {size}, ma lo spazio è giusto. Meglio non aprire troppe altre cose."
        ),
        (_, SpeedHint::Lenta) => format!(
            "Gira sul processore, versione da {size}. Funziona, sarà più lento."
        ),
        _ => format!(
            "Abbiamo scelto questa versione da {size} perché offre il miglior equilibrio sul tuo computer."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::QualityScores;
    use crate::hardware::{
        Backends, CpuInfo, DiskInfo, GpuInfo, GpuVendor, MemoryInfo, OsInfo,
    };

    fn variant(id: &str, quant: &str, gb: f64) -> GgufVariant {
        GgufVariant {
            id: id.into(),
            quant: quant.into(),
            filename: format!("{id}.gguf"),
            size_bytes: (gb * GIB as f64) as u64,
            url: format!("https://huggingface.co/test/{id}.gguf"),
            sha256: None,
        }
    }

    fn model(id: &str, overall: u8, variants: Vec<GgufVariant>) -> CatalogModel {
        CatalogModel {
            id: id.into(),
            name: id.into(),
            description: "test".into(),
            categories: vec!["generale".into()],
            quality: QualityScores {
                overall,
                italian: 3,
                coding: 3,
                reasoning: 3,
            },
            author: "test".into(),
            logo_org: None,
            license: "MIT".into(),
            stats: None,
            variants,
        }
    }

    fn hardware(vram_gb: Option<f64>, ram_gb: f64, disk_gb: f64) -> HardwareReport {
        let ram = (ram_gb * GIB as f64) as u64;
        HardwareReport {
            os: OsInfo {
                name: Some("Windows".into()),
                version: None,
                arch: "x86_64".into(),
            },
            cpu: CpuInfo {
                name: Some("Test CPU".into()),
                cores: Some(8),
                threads: Some(16),
            },
            memory: MemoryInfo {
                total_bytes: Some(ram),
                available_bytes: Some(ram * 70 / 100),
            },
            gpus: match vram_gb {
                Some(v) => vec![GpuInfo {
                    name: "Test GPU".into(),
                    vendor: GpuVendor::Nvidia,
                    vram_bytes: Some((v * GIB as f64) as u64),
                    index: 0,
                }],
                None => vec![],
            },
            disk: DiskInfo {
                path: Some("C:\\".into()),
                total_bytes: Some((disk_gb * GIB as f64) as u64),
                available_bytes: Some((disk_gb * GIB as f64) as u64),
            },
            backends: Backends {
                cuda: vram_gb.is_some(),
                vulkan: vram_gb.is_some(),
                cpu: true,
            },
        }
    }

    fn catalog(models: Vec<CatalogModel>) -> CatalogFile {
        CatalogFile {
            version: 1,
            updated_at: "2026-08-16".into(),
            source_note: "test".into(),
            models,
        }
    }

    #[test]
    fn tiny_ram_cpu_only_keeps_small_drops_large() {
        let cat = catalog(vec![
            model(
                "tiny",
                2,
                vec![variant("t-q4", "Q4_K_M", 0.5), variant("t-q8", "Q8_0", 0.8)],
            ),
            model("huge", 5, vec![variant("h-q4", "Q4_K_M", 17.0)]),
        ]);
        let set = recommend(&cat, &hardware(None, 8.0, 200.0));
        let ids: Vec<_> = set.picks.iter().map(|p| p.model.id.as_str()).collect();
        assert!(ids.contains(&"tiny"));
        assert!(!ids.contains(&"huge"));
        assert_eq!(set.hidden_count, 1);
        assert_eq!(set.picks[0].speed, SpeedHint::Lenta);
    }

    #[test]
    fn mid_gpu_picks_q4_not_q8() {
        let cat = catalog(vec![model(
            "mid",
            4,
            vec![
                variant("m-q4s", "Q4_K_S", 5.0),
                variant("m-q4m", "Q4_K_M", 5.4),
                variant("m-q5", "Q5_K_M", 6.2),
                variant("m-q8", "Q8_0", 9.0),
            ],
        )]);
        let set = recommend(&cat, &hardware(Some(8.0), 16.0, 200.0));
        assert_eq!(set.picks.len(), 1);
        assert_eq!(set.picks[0].recommended.quant, "Q4_K_M");
        assert_eq!(set.picks[0].fit, FitLevel::Comodo);
    }

    #[test]
    fn roomy_gpu_can_step_to_q5() {
        let cat = catalog(vec![model(
            "mid",
            4,
            vec![
                variant("m-q4m", "Q4_K_M", 5.4),
                variant("m-q5", "Q5_K_M", 6.2),
            ],
        )]);
        let set = recommend(&cat, &hardware(Some(24.0), 32.0, 400.0));
        assert_eq!(set.picks[0].recommended.quant, "Q5_K_M");
    }

    #[test]
    fn large_model_hidden_on_small_gpu() {
        let cat = catalog(vec![model(
            "flag",
            5,
            vec![variant("f-q4", "Q4_K_M", 16.0)],
        )]);
        let set = recommend(&cat, &hardware(Some(6.0), 16.0, 200.0));
        assert!(set.picks.is_empty());
        assert_eq!(set.hidden_count, 1);
    }

    #[test]
    fn disk_too_small_hides_model() {
        let cat = catalog(vec![model(
            "mid",
            4,
            vec![variant("m-q4", "Q4_K_M", 5.4)],
        )]);
        let set = recommend(&cat, &hardware(Some(12.0), 32.0, 4.0));
        assert!(set.picks.is_empty());
    }

    #[test]
    fn note_uses_detected_sizes_not_a_fixed_pc() {
        let cat = catalog(vec![model(
            "tiny",
            2,
            vec![variant("t-q4", "Q4_K_M", 0.5)],
        )]);
        let a = recommend(&cat, &hardware(Some(8.0), 16.0, 200.0));
        let b = recommend(&cat, &hardware(Some(24.0), 64.0, 200.0));
        assert!(a.machine_note.contains("8 GB"));
        assert!(b.machine_note.contains("24 GB"));
        assert_ne!(a.machine_note, b.machine_note);
    }
}
