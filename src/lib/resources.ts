import type { HardwareReport } from "./hardware";
import type { AiPerformance } from "./profile";
import type { RuntimePhase } from "./runtime";

export function ramUsedRatio(total: number | null, available: number | null): number | null {
  if (total == null || total <= 0 || available == null) return null;
  return Math.max(0, Math.min(1, (total - available) / total));
}

export function performanceFill(performance: AiPerformance): number {
  switch (performance) {
    case "excellent":
      return 0.92;
    case "great":
      return 0.78;
    case "good":
      return 0.62;
    case "fair":
      return 0.42;
    case "limited":
      return 0.24;
    default:
      return 0.5;
  }
}

export function runtimeActivity(phase: RuntimePhase | undefined): number {
  switch (phase) {
    case "inRisposta":
      return 0.72;
    case "avvio":
    case "motore":
      return 0.48;
    case "pronto":
      return 0.28;
    case "errore":
      return 0.2;
    default:
      return 0.12;
  }
}

export function gpuPresent(hardware: HardwareReport): boolean {
  return hardware.gpus.length > 0;
}
