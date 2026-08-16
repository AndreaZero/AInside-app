import { useEffect, useRef, useState } from "react";
import { jobBarBytes, type DownloadJob } from "../lib/download";

export type DownloadPace = {
  bytesPerSec: number | null;
  etaSec: number | null;
};

export function useDownloadPace(job: DownloadJob | undefined): DownloadPace {
  const prev = useRef<{ at: number; bytes: number } | null>(null);
  const [pace, setPace] = useState<DownloadPace>({ bytesPerSec: null, etaSec: null });

  useEffect(() => {
    if (!job || (job.status !== "inCorso" && job.status !== "controllo")) {
      prev.current = null;
      setPace({ bytesPerSec: null, etaSec: null });
      return;
    }

    const now = Date.now();
    const bytes = jobBarBytes(job);
    const last = prev.current;
    if (last && now > last.at) {
      const deltaBytes = bytes - last.bytes;
      const deltaSec = (now - last.at) / 1000;
      if (deltaSec > 0.2 && deltaBytes >= 0) {
        const bytesPerSec = deltaBytes / deltaSec;
        const remain = job.expectedBytes - bytes;
        setPace({
          bytesPerSec,
          etaSec: bytesPerSec > 0 && remain > 0 ? remain / bytesPerSec : null,
        });
      }
    }
    prev.current = { at: now, bytes };
  }, [job?.id, job?.receivedBytes, job?.verifiedBytes, job?.status, job?.expectedBytes]);

  return pace;
}
