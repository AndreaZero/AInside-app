import type { HardwareReport } from "./hardware";

export type AiPerformance =
  | "limited"
  | "fair"
  | "good"
  | "great"
  | "excellent";

export type HardwareSummary = {
  gpuLine: string;
  ramLine: string;
  cpuLine: string;
  note: string;
};

export type HardwareProfile = {
  hardware: HardwareReport;
  performance: AiPerformance;
  performanceLabel: string;
  summary: HardwareSummary;
};
