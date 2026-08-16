use serde::Serialize;

use crate::settings::ActiveModel;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LibraryStatus {
    Pronto,
    Incompleto,
    Corrotto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub model_id: String,
    pub model_name: String,
    pub variant_id: String,
    pub filename: String,
    pub path: String,
    pub in_download_root: bool,
    pub bytes: u64,
    pub expected_bytes: u64,
    pub status: LibraryStatus,
    pub status_label: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub items: Vec<LibraryItem>,
    pub total_bytes: u64,
    pub ready_count: u32,
    pub active: Option<ActiveModel>,
}

pub fn status_label(status: LibraryStatus) -> String {
    match status {
        LibraryStatus::Pronto => "Sul disco".into(),
        LibraryStatus::Incompleto => "Incompleto".into(),
        LibraryStatus::Corrotto => "Danneggiato".into(),
    }
}

pub fn classify(bytes: u64, expected: u64, is_part: bool) -> LibraryStatus {
    if is_part {
        return LibraryStatus::Incompleto;
    }
    if expected > 0 && bytes != expected {
        return LibraryStatus::Corrotto;
    }
    if bytes == 0 {
        return LibraryStatus::Incompleto;
    }
    LibraryStatus::Pronto
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_is_incomplete() {
        assert_eq!(classify(100, 200, true), LibraryStatus::Incompleto);
    }

    #[test]
    fn size_mismatch_is_corrupt() {
        assert_eq!(classify(10, 200, false), LibraryStatus::Corrotto);
    }

    #[test]
    fn matching_size_is_ready() {
        assert_eq!(classify(200, 200, false), LibraryStatus::Pronto);
    }
}
