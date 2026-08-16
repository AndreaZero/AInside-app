use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    InCoda,
    InCorso,
    Controllo,
    Pronto,
    InPausa,
    Fallito,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub id: String,
    pub model_id: String,
    pub model_name: String,
    pub variant_id: String,
    pub filename: String,
    pub dest_path: String,
    pub expected_bytes: u64,
    pub received_bytes: u64,
    pub verified_bytes: u64,
    pub status: DownloadStatus,
    pub status_label: String,
    pub message: String,
    pub error_detail: Option<String>,
    pub chosen_note: String,
}

impl DownloadJob {
    pub fn with_status(mut self, status: DownloadStatus, message: impl Into<String>) -> Self {
        self.status = status;
        self.status_label = status_label(status);
        self.message = message.into();
        self
    }
}

pub fn status_label(status: DownloadStatus) -> String {
    match status {
        DownloadStatus::InCoda => "In attesa".into(),
        DownloadStatus::InCorso => "In corso".into(),
        DownloadStatus::Controllo => "Controllo il file".into(),
        DownloadStatus::Pronto => "Pronto".into(),
        DownloadStatus::InPausa => "In pausa".into(),
        DownloadStatus::Fallito => "Non riuscito".into(),
    }
}

pub const CHOSEN_NOTE: &str =
    "Abbiamo scelto questa versione perché offre il miglior equilibrio tra qualità e velocità sul tuo computer.";
