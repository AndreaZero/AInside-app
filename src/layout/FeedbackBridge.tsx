import { useEffect, useRef } from "react";
import { useDownloads } from "../hooks/useDownloads";
import type { DownloadStatus } from "../lib/download";
import { useFeedback } from "../ui/overlays";

export function FeedbackBridge() {
  const { jobs } = useDownloads();
  const feedback = useFeedback();
  const prev = useRef(new Map<string, DownloadStatus>());

  useEffect(() => {
    for (const job of jobs) {
      const was = prev.current.get(job.id);
      if (was && was !== job.status) {
        if (job.status === "pronto") {
          feedback.success("Modello scaricato correttamente", job.modelName);
        } else if (job.status === "inPausa" && was === "inCorso") {
          feedback.info("Download annullato", job.modelName);
        } else if (job.status === "fallito") {
          const text = `${job.message} ${job.errorDetail ?? ""}`.toLowerCase();
          if (text.includes("spazio") || text.includes("disk") || text.includes("space")) {
            feedback.error("Spazio su disco insufficiente", job.modelName);
          } else {
            feedback.error(job.message || "Download non riuscito", job.modelName);
          }
        }
      }
    }
    prev.current = new Map(jobs.map((job) => [job.id, job.status]));
  }, [jobs, feedback]);

  return null;
}
