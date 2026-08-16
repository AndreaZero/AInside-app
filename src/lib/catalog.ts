export type QualityScores = {
  overall: number;
  italian: number;
  coding: number;
  reasoning: number;
};

export type GgufVariant = {
  id: string;
  quant: string;
  filename: string;
  sizeBytes: number;
  url: string;
  sha256: string | null;
};

export type BenchScore = {
  label: string;
  value: string;
  source: string;
};

export type ModelStats = {
  downloads: number;
  likes: number;
  repo: string;
  checkedAt: string;
  benches: BenchScore[];
};

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  categories: string[];
  quality: QualityScores;
  author: string;
  logoOrg?: string | null;
  license: string;
  stats?: ModelStats | null;
  variants: GgufVariant[];
};

export type CatalogFile = {
  version: number;
  updatedAt: string;
  sourceNote: string;
  models: CatalogModel[];
};

export const CATEGORY_LABEL: Record<string, string> = {
  generale: "Generale",
  programmazione: "Programmazione",
  scrittura: "Scrittura",
  ragionamento: "Ragionamento",
  leggeri: "Leggeri",
  visione: "Visione",
};

export function qualityWord(score: number): string {
  if (score >= 5) return "ottima";
  if (score >= 4) return "alta";
  if (score >= 3) return "buona";
  if (score >= 2) return "discreta";
  return "bassa";
}

export function smallestVariant(model: CatalogModel): GgufVariant | undefined {
  return [...model.variants].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
}

export type FitLevel = "stretto" | "ok" | "comodo";
export type SpeedHint = "lenta" | "buona" | "veloce";

export type ModelRecommendation = {
  model: CatalogModel;
  fit: FitLevel;
  fitLabel: string;
  speed: SpeedHint;
  speedLabel: string;
  reason: string;
  recommended: GgufVariant;
  alternatives: GgufVariant[];
};

export type RecommendationSet = {
  updatedAt: string;
  sourceNote: string;
  machineNote: string;
  picks: ModelRecommendation[];
  hiddenCount: number;
};
