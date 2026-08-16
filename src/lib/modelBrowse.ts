import {
  CATEGORY_LABEL,
  smallestVariant,
  type CatalogModel,
  type ModelRecommendation,
  type SpeedHint,
} from "./catalog";

export const CATEGORY_FILTERS = [
  { id: "tutti", label: "Tutti" },
  { id: "generale", label: "Generale" },
  { id: "programmazione", label: "Programmazione" },
  { id: "scrittura", label: "Scrittura" },
  { id: "ragionamento", label: "Ragionamento" },
  { id: "leggeri", label: "Leggeri" },
  { id: "visione", label: "Visione" },
] as const;

export const SPEED_FILTERS = [
  { id: "tutte", label: "Tutte le velocità" },
  { id: "veloce", label: "Veloce" },
  { id: "buona", label: "Buona" },
  { id: "lenta", label: "Lenta" },
] as const;

export const SIZE_FILTERS = [
  { id: "tutti", label: "Tutti gli spazi" },
  { id: "leggeri", label: "Leggeri" },
  { id: "medi", label: "Medi" },
  { id: "grandi", label: "Grandi" },
] as const;

export const SORT_OPTIONS = [
  { id: "pc", label: "Per questo PC" },
  { id: "usati", label: "Più usati" },
  { id: "piccoli", label: "Più piccoli" },
  { id: "nome", label: "Nome" },
] as const;

export type CategoryFilter = (typeof CATEGORY_FILTERS)[number]["id"];
export type SpeedFilter = (typeof SPEED_FILTERS)[number]["id"];
export type SizeFilter = (typeof SIZE_FILTERS)[number]["id"];
export type SortId = (typeof SORT_OPTIONS)[number]["id"];

const GIB = 1024 * 1024 * 1024;

export type BrowseFilters = {
  query: string;
  category: CategoryFilter;
  speed: SpeedFilter;
  size: SizeFilter;
  sort: SortId;
};

export function matchesQuery(model: CatalogModel, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    model.name,
    model.description,
    model.author,
    model.license,
    model.stats?.repo ?? "",
    ...model.categories.map((id) => CATEGORY_LABEL[id] ?? id),
    ...model.variants.map((variant) => `${variant.quant} ${variant.filename}`),
    ...(model.stats?.benches ?? []).map((bench) => `${bench.label} ${bench.source}`),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function matchesCategory(model: CatalogModel, category: CategoryFilter): boolean {
  return category === "tutti" || model.categories.includes(category);
}

export function sizeBucket(bytes: number): Exclude<SizeFilter, "tutti"> {
  const gib = bytes / GIB;
  if (gib < 4) return "leggeri";
  if (gib < 12) return "medi";
  return "grandi";
}

export function matchesSize(bytes: number, size: SizeFilter): boolean {
  return size === "tutti" || sizeBucket(bytes) === size;
}

export function matchesSpeed(speed: SpeedHint, filter: SpeedFilter): boolean {
  return filter === "tutte" || speed === filter;
}

export function formatDownloads(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    const text =
      millions >= 10
        ? Math.round(millions).toString()
        : millions.toFixed(1).replace(".", ",");
    return `${text} mln download`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 1000).toLocaleString("it-IT")} mila download`;
  }
  return `${count.toLocaleString("it-IT")} download`;
}

export function formatLikes(count: number): string {
  return `${count.toLocaleString("it-IT")} preferiti`;
}

export function popularityLine(model: CatalogModel): string | null {
  const stats = model.stats;
  if (!stats) return null;
  return `${formatDownloads(stats.downloads)} · ${formatLikes(stats.likes)}`;
}

export function benchLine(model: CatalogModel): string | null {
  const benches = model.stats?.benches ?? [];
  if (benches.length === 0) return null;
  return benches.map((bench) => `${bench.label} ${bench.value}`).join(" · ");
}

function downloadsOf(model: CatalogModel): number {
  return model.stats?.downloads ?? 0;
}

function comparePicks(a: ModelRecommendation, b: ModelRecommendation, sort: SortId): number {
  if (sort === "usati") return downloadsOf(b.model) - downloadsOf(a.model);
  if (sort === "piccoli") return a.recommended.sizeBytes - b.recommended.sizeBytes;
  if (sort === "nome") return a.model.name.localeCompare(b.model.name, "it");
  return 0;
}

function compareModels(a: CatalogModel, b: CatalogModel, sort: SortId): number {
  if (sort === "usati") return downloadsOf(b) - downloadsOf(a);
  if (sort === "piccoli") {
    const left = smallestVariant(a)?.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    const right = smallestVariant(b)?.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  }
  if (sort === "nome") return a.name.localeCompare(b.name, "it");
  return 0;
}

export function filterPicks(
  picks: ModelRecommendation[],
  filters: BrowseFilters,
): ModelRecommendation[] {
  const visible = picks.filter(
    (pick) =>
      matchesQuery(pick.model, filters.query) &&
      matchesCategory(pick.model, filters.category) &&
      matchesSpeed(pick.speed, filters.speed) &&
      matchesSize(pick.recommended.sizeBytes, filters.size),
  );
  if (filters.sort === "pc") return visible;
  return [...visible].sort((a, b) => comparePicks(a, b, filters.sort));
}

export function filterHidden(
  models: CatalogModel[],
  filters: BrowseFilters,
): CatalogModel[] {
  const visible = models.filter((model) => {
    const smallest = smallestVariant(model);
    return (
      matchesQuery(model, filters.query) &&
      matchesCategory(model, filters.category) &&
      matchesSize(smallest?.sizeBytes ?? 0, filters.size) &&
      filters.speed === "tutte"
    );
  });
  if (filters.sort === "pc") return visible;
  return [...visible].sort((a, b) => compareModels(a, b, filters.sort));
}
