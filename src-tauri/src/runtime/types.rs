use serde::{Deserialize, Serialize};

use crate::settings::PerfProfile;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimePhase {
    Spento,
    Motore,
    Avvio,
    Pronto,
    InRisposta,
    Errore,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub phase: RuntimePhase,
    pub phase_label: String,
    pub message: String,
    pub model_name: Option<String>,
    pub model_id: Option<String>,
    pub variant_id: Option<String>,
    pub device_label: String,
    pub engine_ready: bool,
    pub received_bytes: u64,
    pub expected_bytes: u64,
    pub error_detail: Option<String>,
    pub outcome: Option<String>,
    pub profile_label: Option<String>,
    pub profile: Option<PerfProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenChunk {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

impl RuntimeSnapshot {
    pub fn spento() -> Self {
        Self {
            phase: RuntimePhase::Spento,
            phase_label: phase_label(RuntimePhase::Spento).into(),
            message: "Il modello è sul disco, non in memoria.".into(),
            model_name: None,
            model_id: None,
            variant_id: None,
            device_label: "—".into(),
            engine_ready: false,
            received_bytes: 0,
            expected_bytes: 0,
            error_detail: None,
            outcome: None,
            profile_label: None,
            profile: None,
        }
    }

    pub fn with_phase(mut self, phase: RuntimePhase, message: impl Into<String>) -> Self {
        self.phase = phase;
        self.phase_label = phase_label(phase).into();
        self.message = message.into();
        if phase != RuntimePhase::Errore {
            self.error_detail = None;
        }
        self
    }

    pub fn with_error(mut self, message: impl Into<String>, detail: impl Into<String>) -> Self {
        self.phase = RuntimePhase::Errore;
        self.phase_label = phase_label(RuntimePhase::Errore).into();
        self.message = message.into();
        self.error_detail = Some(detail.into());
        self
    }
}

pub fn phase_label(phase: RuntimePhase) -> &'static str {
    match phase {
        RuntimePhase::Spento => "Spento",
        RuntimePhase::Motore => "Motore",
        RuntimePhase::Avvio => "Avvio",
        RuntimePhase::Pronto => "Pronto",
        RuntimePhase::InRisposta => "In risposta",
        RuntimePhase::Errore => "Errore",
    }
}
