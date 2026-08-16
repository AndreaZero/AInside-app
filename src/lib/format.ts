const GIB = 1024 * 1024 * 1024;

export function formatGb(bytes: number | null): string {
  if (bytes == null || bytes <= 0) {
    return "—";
  }
  const gb = Math.round((bytes / GIB) * 2) / 2;
  if (Math.abs(gb - Math.round(gb)) < 0.05) {
    return `${Math.round(gb)} GB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / GIB;
  if (gb < 0.1) {
    const mb = bytes / (1024 * 1024);
    return `${Math.max(1, Math.round(mb))} MB`;
  }
  return `${gb.toFixed(1).replace(".", ",")} GB`;
}

export function formatProgress(received: number, expected: number): string {
  if (expected <= 0) return formatSize(received);
  return `${formatSize(received)} di ${formatSize(expected)}`;
}

export function backendList(backends: {
  cuda: boolean;
  vulkan: boolean;
  cpu: boolean;
}): string {
  const items = [
    backends.cuda ? "CUDA" : null,
    backends.vulkan ? "Vulkan" : null,
    backends.cpu ? "CPU" : null,
  ].filter((item): item is string => item != null);
  return items.join(" · ");
}

export function formatPercent(received: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.min(100, Math.round((received / expected) * 100));
}

export function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  const mb = bytesPerSec / (1024 * 1024);
  if (mb < 0.1) {
    return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;
  }
  return `${mb.toFixed(1).replace(".", ",")} MB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const sec = ms / 1000;
  if (sec < 60) {
    if (sec < 10) return `${sec.toFixed(1).replace(".", ",")} s`;
    return `${Math.round(sec)} s`;
  }
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTokenRate(tokensPerSec: number | null): string {
  if (tokensPerSec == null || !Number.isFinite(tokensPerSec) || tokensPerSec <= 0) {
    return "—";
  }
  return `${tokensPerSec.toFixed(1).replace(".", ",")} tok/s`;
}

export function paramHint(name: string): string | null {
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*([BM])\b/i);
  if (!match) return null;
  return `${match[1].replace(",", ".")}${match[2].toUpperCase()}`;
}

export function backendLine(backends: {
  cuda: boolean;
  vulkan: boolean;
  cpu: boolean;
}): string {
  if (backends.cuda) return "CUDA / NVIDIA";
  if (backends.vulkan) return "Vulkan";
  if (backends.cpu) return "CPU";
  return "—";
}
