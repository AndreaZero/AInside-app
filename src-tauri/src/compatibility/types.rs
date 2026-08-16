use serde::Serialize;

use crate::catalog::{CatalogModel, GgufVariant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FitLevel {
    Stretto,
    Ok,
    Comodo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SpeedHint {
    Lenta,
    Buona,
    Veloce,
}

impl FitLevel {
    pub fn label_it(self) -> &'static str {
        match self {
            Self::Comodo => "Comodo",
            Self::Ok => "Usabile",
            Self::Stretto => "Stretto",
        }
    }
}

impl SpeedHint {
    pub fn label_it(self) -> &'static str {
        match self {
            Self::Veloce => "Veloce",
            Self::Buona => "Buona",
            Self::Lenta => "Lenta",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRecommendation {
    pub model: CatalogModel,
    pub fit: FitLevel,
    pub fit_label: String,
    pub speed: SpeedHint,
    pub speed_label: String,
    pub reason: String,
    pub recommended: GgufVariant,
    pub alternatives: Vec<GgufVariant>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationSet {
    pub updated_at: String,
    pub source_note: String,
    pub machine_note: String,
    pub picks: Vec<ModelRecommendation>,
    pub hidden_count: u32,
}
