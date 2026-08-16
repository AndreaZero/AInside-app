//! Rilevamento CPU, GPU, RAM, disco e backend disponibili.

mod backends;
mod detect;
mod disk;
mod gpus;
mod score;
mod types;
mod vendor;

pub use score::{format_gb, HardwareProfile};
pub use types::HardwareReport;

#[cfg(test)]
pub use types::{Backends, CpuInfo, DiskInfo, GpuInfo, MemoryInfo, OsInfo};
#[cfg(test)]
pub use vendor::GpuVendor;

#[tauri::command]
pub fn get_hardware() -> HardwareReport {
    detect::collect()
}

#[tauri::command]
pub fn get_hardware_profile() -> HardwareProfile {
    score::build_profile(detect::collect())
}
