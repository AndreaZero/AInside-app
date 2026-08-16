export type LibrarySettings = {
  downloadRoot: string;
  extraRoots: string[];
};

export type ActiveModel = {
  modelId: string;
  variantId: string;
  path: string;
};

export type PerfProfile = "risparmio" | "bilanciato" | "massime";

export const PROFILE_LABEL: Record<PerfProfile, string> = {
  risparmio: "Risparmio",
  bilanciato: "Bilanciato",
  massime: "Massime prestazioni",
};

export type ExpertSettings = {
  enabled: boolean;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
  repeatPenalty?: number | null;
  context?: number | null;
  threads?: number | null;
  batch?: number | null;
  gpuLayers?: number | null;
  flashAttention?: boolean | null;
  kvCache?: string | null;
  seed?: number | null;
  systemPrompt?: string | null;
};

export const emptyExpert = (): ExpertSettings => ({ enabled: false });

export type ApiSettings = {
  enabled: boolean;
};

export type ApiStatus = {
  enabled: boolean;
  listening: boolean;
  url: string;
  message: string;
  errorDetail?: string | null;
};

export type AppSettings = {
  library: LibrarySettings;
  active?: ActiveModel | null;
  profile?: PerfProfile;
  expert?: ExpertSettings;
  api?: ApiSettings;
  thinking?: boolean;
};
