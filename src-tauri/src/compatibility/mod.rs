//! Stima se un modello è usabile sul PC rilevato e quale variante scaricare.

mod engine;
mod types;

pub use types::RecommendationSet;

use crate::catalog;
use crate::hardware;

#[tauri::command]
pub fn get_recommendations() -> Result<RecommendationSet, String> {
    let catalog = catalog::load_catalog()?;
    let hardware = hardware::get_hardware();
    Ok(engine::recommend(&catalog, &hardware))
}
