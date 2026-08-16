use sysinfo::{Disks, System};

use super::backends::detect_backends;
use super::disk::select_disk;
use super::gpus::enumerate_gpus;
use super::types::{CpuInfo, DiskCandidate, HardwareReport, MemoryInfo, OsInfo};

pub fn collect() -> HardwareReport {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let gpus = enumerate_gpus();
    let backends = detect_backends(&gpus);

    HardwareReport {
        os: os_info(),
        cpu: cpu_info(&sys),
        memory: memory_info(&sys),
        gpus,
        disk: disk_info(),
        backends,
    }
}

fn os_info() -> OsInfo {
    OsInfo {
        name: System::name().and_then(non_empty),
        version: System::long_os_version()
            .or_else(System::os_version)
            .and_then(non_empty),
        arch: if System::cpu_arch().is_empty() {
            std::env::consts::ARCH.to_string()
        } else {
            System::cpu_arch()
        },
    }
}

fn cpu_info(sys: &System) -> CpuInfo {
    let name = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .and_then(non_empty);

    let cores = System::physical_core_count().map(|n| n as u32);
    let threads = {
        let n = sys.cpus().len() as u32;
        if n == 0 {
            None
        } else {
            Some(n)
        }
    };

    CpuInfo {
        name,
        cores,
        threads,
    }
}

fn memory_info(sys: &System) -> MemoryInfo {
    let total = sys.total_memory();
    let available = sys.available_memory();
    MemoryInfo {
        total_bytes: nonzero(total),
        available_bytes: if available > 0 { Some(available) } else { None },
    }
}

fn disk_info() -> super::types::DiskInfo {
    let disks = Disks::new_with_refreshed_list();
    let candidates: Vec<DiskCandidate> = disks
        .iter()
        .map(|disk| DiskCandidate {
            path: disk.mount_point().to_string_lossy().to_string(),
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
            removable: disk.is_removable(),
        })
        .filter(|d| !d.path.is_empty())
        .collect();

    let preferred = if cfg!(windows) {
        Some("C:\\")
    } else {
        None
    };

    select_disk(&candidates, preferred)
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn nonzero(value: u64) -> Option<u64> {
    if value == 0 {
        None
    } else {
        Some(value)
    }
}
