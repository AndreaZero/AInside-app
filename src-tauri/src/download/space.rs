use std::path::Path;

const RESERVE: u64 = 512 * 1024 * 1024;

pub fn available_bytes(path: &Path) -> Option<u64> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let probe = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    disks
        .iter()
        .filter(|disk| probe.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space())
}

pub fn ensure_space(path: &Path, needed: u64) -> Result<(), String> {
    let Some(free) = available_bytes(path) else {
        return Ok(());
    };
    let want = needed.saturating_add(RESERVE);
    if free < want {
        return Err("Non c’è spazio sufficiente su disco.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserve_is_half_gib() {
        assert_eq!(RESERVE, 512 * 1024 * 1024);
    }
}
