use super::types::Backends;
use super::vendor::GpuVendor;

pub fn detect_backends(gpus: &[super::types::GpuInfo]) -> Backends {
    let has_nvidia = gpus.iter().any(|g| g.vendor == GpuVendor::Nvidia);
    Backends {
        cpu: true,
        cuda: has_nvidia && library_present(cuda_lib()),
        vulkan: library_present(vulkan_lib()),
    }
}

fn cuda_lib() -> &'static str {
    if cfg!(windows) {
        "nvcuda.dll"
    } else if cfg!(target_os = "macos") {
        "libcuda.dylib"
    } else {
        "libcuda.so.1"
    }
}

fn vulkan_lib() -> &'static str {
    if cfg!(windows) {
        "vulkan-1.dll"
    } else if cfg!(target_os = "macos") {
        "libvulkan.dylib"
    } else {
        "libvulkan.so.1"
    }
}

#[cfg(windows)]
fn library_present(name: &str) -> bool {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::FreeLibrary;
    use windows::Win32::System::LibraryLoader::LoadLibraryW;

    let wide = HSTRING::from(name);
    unsafe {
        match LoadLibraryW(&wide) {
            Ok(handle) => {
                let _ = FreeLibrary(handle);
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(unix)]
fn library_present(name: &str) -> bool {
    use std::ffi::{c_char, c_int, c_void, CString};

    let c_name = match CString::new(name) {
        Ok(s) => s,
        Err(_) => return false,
    };

    unsafe {
        extern "C" {
            fn dlopen(filename: *const c_char, flags: c_int) -> *mut c_void;
            fn dlclose(handle: *mut c_void) -> c_int;
        }
        const RTLD_NOW: c_int = 2;
        let handle = dlopen(c_name.as_ptr(), RTLD_NOW);
        if handle.is_null() {
            false
        } else {
            let _ = dlclose(handle);
            true
        }
    }
}

#[cfg(not(any(windows, unix)))]
fn library_present(_name: &str) -> bool {
    false
}
