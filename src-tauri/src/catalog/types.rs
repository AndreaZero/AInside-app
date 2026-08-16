use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFile {
    pub version: u32,
    pub updated_at: String,
    pub source_note: String,
    pub models: Vec<CatalogModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub categories: Vec<String>,
    pub quality: QualityScores,
    pub author: String,
    #[serde(default)]
    pub logo_org: Option<String>,
    pub license: String,
    #[serde(default)]
    pub stats: Option<ModelStats>,
    pub variants: Vec<GgufVariant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    pub downloads: u64,
    pub likes: u64,
    pub repo: String,
    pub checked_at: String,
    #[serde(default)]
    pub benches: Vec<BenchScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchScore {
    pub label: String,
    pub value: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityScores {
    pub overall: u8,
    pub italian: u8,
    pub coding: u8,
    pub reasoning: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GgufVariant {
    pub id: String,
    pub quant: String,
    pub filename: String,
    pub size_bytes: u64,
    pub url: String,
    pub sha256: Option<String>,
}
