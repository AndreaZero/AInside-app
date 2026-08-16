use super::types::{DiskCandidate, DiskInfo};

pub fn select_disk(
    candidates: &[DiskCandidate],
    preferred_mount: Option<&str>,
) -> DiskInfo {
    if candidates.is_empty() {
        return DiskInfo {
            path: None,
            total_bytes: None,
            available_bytes: None,
        };
    }

    let chosen = preferred_mount
        .and_then(|pref| {
            candidates
                .iter()
                .find(|c| mounts_equal(&c.path, pref))
        })
        .or_else(|| best_local(candidates))
        .or_else(|| candidates.iter().max_by_key(|c| c.available_bytes))
        .unwrap_or(&candidates[0]);

    DiskInfo {
        path: Some(chosen.path.clone()),
        total_bytes: Some(chosen.total_bytes),
        available_bytes: Some(chosen.available_bytes),
    }
}

fn best_local(candidates: &[DiskCandidate]) -> Option<&DiskCandidate> {
    candidates
        .iter()
        .filter(|c| !c.removable)
        .max_by_key(|c| c.available_bytes)
}

fn mounts_equal(a: &str, b: &str) -> bool {
    normalize_mount(a) == normalize_mount(b)
}

fn normalize_mount(path: &str) -> String {
    path.trim()
        .trim_end_matches(['/', '\\'])
        .to_ascii_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disk(path: &str, free: u64, removable: bool) -> DiskCandidate {
        DiskCandidate {
            path: path.into(),
            total_bytes: free + 1,
            available_bytes: free,
            removable,
        }
    }

    #[test]
    fn empty_list_is_unknown() {
        let info = select_disk(&[], Some("C:\\"));
        assert!(info.path.is_none());
        assert!(info.available_bytes.is_none());
    }

    #[test]
    fn prefers_requested_windows_c() {
        let disks = vec![
            disk("D:\\", 800, false),
            disk("C:\\", 200, false),
        ];
        let info = select_disk(&disks, Some("C:\\"));
        assert_eq!(info.path.as_deref(), Some("C:\\"));
    }

    #[test]
    fn ignores_slash_and_case() {
        let disks = vec![disk("c:/", 10, false)];
        let info = select_disk(&disks, Some("C:\\"));
        assert_eq!(info.path.as_deref(), Some("c:/"));
    }

    #[test]
    fn skips_removable_when_local_exists() {
        let disks = vec![
            disk("E:\\", 9_000, true),
            disk("C:\\", 100, false),
        ];
        let info = select_disk(&disks, None);
        assert_eq!(info.path.as_deref(), Some("C:\\"));
    }
}
