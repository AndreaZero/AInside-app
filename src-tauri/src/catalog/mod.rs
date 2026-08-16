//! Catalogo curato di modelli. I file restano su Hugging Face.

mod types;

pub use types::{CatalogFile, CatalogModel, GgufVariant};

#[cfg(test)]
pub use types::QualityScores;

const CATALOG_JSON: &str = include_str!("models.json");

pub fn load_catalog() -> Result<CatalogFile, String> {
    serde_json::from_str(CATALOG_JSON)
        .map_err(|e| format!("Catalogo illeggibile: {e}"))
}

#[tauri::command]
pub fn get_catalog() -> Result<CatalogFile, String> {
    load_catalog()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_parses_and_has_urls() {
        let catalog = load_catalog().expect("json valido");
        assert!(!catalog.models.is_empty());
        assert!(!catalog.updated_at.is_empty());
        for model in &catalog.models {
            assert!(!model.variants.is_empty(), "{}", model.id);
            if let Some(stats) = &model.stats {
                assert!(stats.downloads > 0, "{}", model.id);
                assert!(!stats.repo.is_empty(), "{}", model.id);
            }
            for variant in &model.variants {
                assert!(
                    variant.url.starts_with("https://huggingface.co/"),
                    "{}",
                    variant.id
                );
                assert!(variant.size_bytes > 0);
            }
        }
    }
}
