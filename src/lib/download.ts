export type DownloadStatus =
  | "inCoda"
  | "inCorso"
  | "controllo"
  | "pronto"
  | "inPausa"
  | "fallito";

export type DownloadJob = {
  id: string;
  modelId: string;
  modelName: string;
  variantId: string;
  filename: string;
  destPath: string;
  expectedBytes: number;
  receivedBytes: number;
  verifiedBytes?: number;
  status: DownloadStatus;
  statusLabel: string;
  message: string;
  errorDetail: string | null;
  chosenNote: string;
};

export function jobFor(
  jobs: DownloadJob[],
  variantId: string,
): DownloadJob | undefined {
  return jobs.find((job) => job.variantId === variantId);
}

export function isActive(job: DownloadJob | undefined): boolean {
  return (
    job != null &&
    (job.status === "inCoda" ||
      job.status === "inCorso" ||
      job.status === "controllo")
  );
}

export function jobBarBytes(job: DownloadJob): number {
  if (job.status === "controllo") return job.verifiedBytes ?? 0;
  return job.receivedBytes;
}
