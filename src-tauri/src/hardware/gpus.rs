use super::types::GpuInfo;

#[cfg(windows)]
mod dxgi {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_DESC1,
    };

    use crate::hardware::types::GpuInfo;
    use crate::hardware::vendor::{vendor_from_pci_id, PCI_MICROSOFT};

    pub fn enumerate() -> Vec<GpuInfo> {
        match enumerate_dxgi() {
            Ok(list) => list,
            Err(_) => Vec::new(),
        }
    }

    fn enumerate_dxgi() -> windows::core::Result<Vec<GpuInfo>> {
        unsafe {
            let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
            let mut out = Vec::new();
            let mut adapter_index = 0u32;
            let mut visible_index = 0u32;

            loop {
                let adapter = match factory.EnumAdapters1(adapter_index) {
                    Ok(adapter) => adapter,
                    Err(_) => break,
                };
                adapter_index += 1;

                let desc = match adapter.GetDesc1() {
                    Ok(desc) => desc,
                    Err(_) => continue,
                };

                if is_software(&desc) {
                    continue;
                }

                let name = utf16_trim(&desc.Description);
                if name.is_empty() {
                    continue;
                }

                let vram = desc.DedicatedVideoMemory as u64;
                out.push(GpuInfo {
                    name,
                    vendor: vendor_from_pci_id(desc.VendorId),
                    vram_bytes: if vram > 0 { Some(vram) } else { None },
                    index: visible_index,
                });
                visible_index += 1;
            }

            Ok(out)
        }
    }

    fn is_software(desc: &DXGI_ADAPTER_DESC1) -> bool {
        const DXGI_ADAPTER_FLAG_SOFTWARE: u32 = 2;
        desc.VendorId == PCI_MICROSOFT || (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) != 0
    }

    fn utf16_trim(buf: &[u16]) -> String {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end]).trim().to_string()
    }
}

#[cfg(windows)]
pub fn enumerate_gpus() -> Vec<GpuInfo> {
    dxgi::enumerate()
}

#[cfg(not(windows))]
pub fn enumerate_gpus() -> Vec<GpuInfo> {
    Vec::new()
}
