export type GpuVendor = "nvidia" | "amd" | "intel" | "other";

export type OsInfo = {
  name: string | null;
  version: string | null;
  arch: string;
};

export type CpuInfo = {
  name: string | null;
  cores: number | null;
  threads: number | null;
};

export type MemoryInfo = {
  totalBytes: number | null;
  availableBytes: number | null;
};

export type GpuInfo = {
  name: string;
  vendor: GpuVendor;
  vramBytes: number | null;
  index: number;
};

export type DiskInfo = {
  path: string | null;
  totalBytes: number | null;
  availableBytes: number | null;
};

export type Backends = {
  cuda: boolean;
  vulkan: boolean;
  cpu: boolean;
};

export type HardwareReport = {
  os: OsInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpus: GpuInfo[];
  disk: DiskInfo;
  backends: Backends;
};
