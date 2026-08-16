use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Other,
}

pub const PCI_NVIDIA: u32 = 0x10DE;
pub const PCI_AMD_GPU: u32 = 0x1002;
pub const PCI_AMD_SYS: u32 = 0x1022;
pub const PCI_INTEL: u32 = 0x8086;
pub const PCI_MICROSOFT: u32 = 0x1414;

pub fn vendor_from_pci_id(id: u32) -> GpuVendor {
    match id {
        PCI_NVIDIA => GpuVendor::Nvidia,
        PCI_AMD_GPU | PCI_AMD_SYS => GpuVendor::Amd,
        PCI_INTEL => GpuVendor::Intel,
        _ => GpuVendor::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_vendors() {
        assert_eq!(vendor_from_pci_id(PCI_NVIDIA), GpuVendor::Nvidia);
        assert_eq!(vendor_from_pci_id(PCI_AMD_GPU), GpuVendor::Amd);
        assert_eq!(vendor_from_pci_id(PCI_INTEL), GpuVendor::Intel);
        assert_eq!(vendor_from_pci_id(PCI_MICROSOFT), GpuVendor::Other);
        assert_eq!(vendor_from_pci_id(0), GpuVendor::Other);
    }
}
