import { backendList, formatGb } from "./format";
import type { HardwareReport } from "./hardware";
import type { RuntimeSnapshot } from "./runtime";

export type DebugReport = {
  appName: string;
  appVersion: string;
  engineKind: string;
  engineTag: string | null;
  planDetail: string;
  loadLog: string;
  runtime: RuntimeSnapshot;
  hardware: HardwareReport;
  profile: string;
  thinking: boolean;
  expert: boolean;
  downloadRoot: string;
  runtimeDir: string;
};

export function formatDebugDump(report: DebugReport): string {
  const hw = report.hardware;
  const gpu = hw.gpus[0];
  const rt = report.runtime;
  return [
    `AInside ${report.appVersion}`,
    `Motore: ${report.engineKind} ${report.engineTag ?? "—"}`,
    `Profilo: ${report.profile}`,
    `Ragionamento: ${report.thinking ? "acceso" : "spento"}`,
    `Esperto: ${report.expert ? "acceso" : "spento"}`,
    `Stato: ${rt.phaseLabel} — ${rt.message}`,
    `Modello: ${rt.modelName ?? "—"} (${rt.variantId ?? "—"})`,
    `Dispositivo: ${rt.deviceLabel}`,
    `Esito: ${rt.outcome ?? "—"}`,
    `CPU: ${hw.cpu.name ?? "—"} · ${hw.cpu.cores ?? "—"}c / ${hw.cpu.threads ?? "—"}t`,
    `RAM: ${formatGb(hw.memory.totalBytes)} tot, ${formatGb(hw.memory.availableBytes)} libera`,
    `GPU: ${gpu?.name ?? "—"} · ${formatGb(gpu?.vramBytes ?? null)}`,
    `Backend: ${backendList(hw.backends)}`,
    `OS: ${hw.os.name ?? "—"} ${hw.os.version ?? ""} ${hw.os.arch}`,
    `Download: ${report.downloadRoot}`,
    `Log su disco: ${report.runtimeDir}`,
    "",
    "Piano:",
    report.planDetail.trim() || "—",
    "",
    "Log motore:",
    report.loadLog.trim() || "—",
  ].join("\n");
}
