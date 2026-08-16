import type { DownloadJob } from "./download";

export type DownloadFailKind = "checksum" | "network" | "generic";

export function downloadFailKind(job: DownloadJob): DownloadFailKind {
  const text = `${job.message} ${job.errorDetail ?? ""}`.toLowerCase();
  if (
    text.includes("sha") ||
    text.includes("checksum") ||
    text.includes("integrit") ||
    text.includes("hash")
  ) {
    return "checksum";
  }
  if (
    text.includes("rete") ||
    text.includes("network") ||
    text.includes("http") ||
    text.includes("conness") ||
    text.includes("timeout") ||
    text.includes("dns")
  ) {
    return "network";
  }
  return "generic";
}

export function repoFromPath(path: string): string | null {
  const match = path.match(/huggingface\.co\/([^/]+\/[^/]+)/i);
  return match ? match[1] : null;
}
