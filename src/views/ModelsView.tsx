import { useMemo, useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useRecommendations } from "../hooks/useRecommendations";
import { cx } from "../lib/cx";
import type { CatalogModel, RecommendationSet } from "../lib/catalog";
import {
  CATEGORY_FILTERS,
  SIZE_FILTERS,
  SORT_OPTIONS,
  SPEED_FILTERS,
  filterHidden,
  filterPicks,
  type BrowseFilters,
  type CategoryFilter,
  type SizeFilter,
  type SortId,
  type SpeedFilter,
} from "../lib/modelBrowse";
import type { RouteId } from "../navigation/routes";
import { Button } from "../ui/controls";
import {
  IconChat,
  IconCode,
  IconEye,
  IconFeather,
  IconFilter,
  IconGrid2,
  IconGrid3,
  IconModels,
  IconPen,
  IconRows,
  IconSearch,
  IconSpark,
} from "../ui/icons";
import { MenuItem, Popover, Tooltip } from "../ui/overlays";
import { CardSkeleton, EmptyState, ErrorState } from "../ui/states";
import { EmptyGlyph } from "../visuals/DownloadRig";
import { HiddenCard, InstalledStrip, PickCard } from "./models/ModelCard";

type GridDensity = "compact" | "cozy" | "large";

const DENSITY_KEY = "ainside.models.density";

const CATEGORY_ICON = {
  tutti: IconModels,
  generale: IconChat,
  programmazione: IconCode,
  scrittura: IconPen,
  ragionamento: IconSpark,
  leggeri: IconFeather,
  visione: IconEye,
} as const;

const DENSITY_OPTIONS = [
  { id: "compact" as const, label: "Griglia fitta", Icon: IconGrid3 },
  { id: "cozy" as const, label: "Griglia media", Icon: IconGrid2 },
  { id: "large" as const, label: "Schede grandi", Icon: IconRows },
];

function readDensity(): GridDensity {
  try {
    const value = localStorage.getItem(DENSITY_KEY);
    if (value === "compact" || value === "cozy" || value === "large") return value;
  } catch {
    /* ignore */
  }
  return "cozy";
}

export function ModelsView({ onNavigate }: { onNavigate: (route: RouteId) => void }) {
  const recs = useRecommendations();
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("tutti");
  const [speed, setSpeed] = useState<SpeedFilter>("tutte");
  const [size, setSize] = useState<SizeFilter>("tutti");
  const [sort, setSort] = useState<SortId>("pc");
  const [showAll, setShowAll] = useState(false);
  const [density, setDensity] = useState<GridDensity>(readDensity);

  if (recs.status === "loading" || catalog.status === "loading") {
    return (
      <section className="page page--wide models-page">
        <header className="models-hero">
          <p className="page-kicker">Catalogo</p>
          <h1 className="page-title">Confronto in corso.</h1>
          <p className="page-note">Sto allineando il catalogo a questo computer.</p>
        </header>
        <div className="model-grid">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </section>
    );
  }

  if (recs.status === "error") {
    return (
      <section className="page">
        <ErrorState title="Modelli non selezionati" description={recs.message} />
      </section>
    );
  }

  if (catalog.status === "error") {
    return (
      <section className="page">
        <ErrorState title="Catalogo non disponibile" description={catalog.message} />
      </section>
    );
  }

  return (
    <RecommendedList
      set={recs.set}
      allModels={catalog.catalog.models}
      filters={{ query, category, speed, size, sort }}
      onQuery={setQuery}
      onCategory={setCategory}
      onSpeed={setSpeed}
      onSize={setSize}
      onSort={setSort}
      showAll={showAll}
      onToggleAll={() => setShowAll((value) => !value)}
      density={density}
      onDensity={(value) => {
        setDensity(value);
        try {
          localStorage.setItem(DENSITY_KEY, value);
        } catch {
          /* ignore */
        }
      }}
      onNavigate={onNavigate}
    />
  );
}

function RecommendedList({
  set,
  allModels,
  filters,
  onQuery,
  onCategory,
  onSpeed,
  onSize,
  onSort,
  showAll,
  onToggleAll,
  density,
  onDensity,
  onNavigate,
}: {
  set: RecommendationSet;
  allModels: CatalogModel[];
  filters: BrowseFilters;
  onQuery: (value: string) => void;
  onCategory: (id: CategoryFilter) => void;
  onSpeed: (id: SpeedFilter) => void;
  onSize: (id: SizeFilter) => void;
  onSort: (id: SortId) => void;
  showAll: boolean;
  onToggleAll: () => void;
  density: GridDensity;
  onDensity: (value: GridDensity) => void;
  onNavigate: (route: RouteId) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersOn =
    filters.speed !== "tutte" || filters.size !== "tutti" || filters.sort !== "pc";
  const pickedIds = useMemo(
    () => new Set(set.picks.map((pick) => pick.model.id)),
    [set.picks],
  );
  const visiblePicks = filterPicks(set.picks, filters);
  const hiddenModels = allModels.filter((model) => !pickedIds.has(model.id));
  const searching = filters.query.trim().length > 0;
  const revealHidden = showAll || searching;
  const visibleHidden = revealHidden ? filterHidden(hiddenModels, filters) : [];
  const empty = visiblePicks.length === 0 && visibleHidden.length === 0;

  return (
    <section className="page page--wide models-page">
      <header className="models-hero">
        <p className="page-kicker">Catalogo</p>
        <h1 className="page-title">Consigliati per te</h1>
        <p className="page-note">
          {set.machineNote} Catalogo aggiornato il {set.updatedAt}.
        </p>
      </header>

      <InstalledStrip onNavigate={onNavigate} />

      <div className="model-board">
        <div className="model-board-top">
          <label className="model-search">
            <IconSearch size={16} />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Cerca un modello, un uso, un autore…"
              aria-label="Cerca modelli"
            />
          </label>
          <div className="model-board-tools">
            <Popover
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              align="end"
              content={
                <>
                  <p className="pop-label">Velocità</p>
                  {SPEED_FILTERS.map((item) => (
                    <MenuItem
                      key={item.id}
                      onSelect={() => {
                        onSpeed(item.id);
                        setFiltersOpen(false);
                      }}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                  <p className="pop-label">Spazio</p>
                  {SIZE_FILTERS.map((item) => (
                    <MenuItem
                      key={item.id}
                      onSelect={() => {
                        onSize(item.id);
                        setFiltersOpen(false);
                      }}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                  <p className="pop-label">Ordine</p>
                  {SORT_OPTIONS.map((item) => (
                    <MenuItem
                      key={item.id}
                      onSelect={() => {
                        onSort(item.id);
                        setFiltersOpen(false);
                      }}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                </>
              }
            >
              <Tooltip label="Filtri e ordine">
                <Button
                  variant="icon"
                  className={cx(filtersOn && "is-on")}
                  aria-label="Filtri e ordine"
                  aria-pressed={filtersOn}
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <IconFilter size={16} />
                </Button>
              </Tooltip>
            </Popover>
            <div className="model-view" role="group" aria-label="Visualizzazione griglia">
              {DENSITY_OPTIONS.map(({ id, label, Icon }) => (
                <Tooltip key={id} label={label}>
                  <Button
                    variant="icon"
                    className={cx(density === id && "is-on")}
                    aria-label={label}
                    aria-pressed={density === id}
                    onClick={() => onDensity(id)}
                  >
                    <Icon size={16} />
                  </Button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
        <div className="model-board-cats" role="tablist" aria-label="Categorie">
          {CATEGORY_FILTERS.map((item) => {
            const Icon = CATEGORY_ICON[item.id];
            return (
              <Tooltip key={item.id} label={item.label}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filters.category === item.id}
                  aria-label={item.label}
                  className={cx("model-cat", filters.category === item.id && "is-active")}
                  onClick={() => onCategory(item.id)}
                >
                  <Icon size={15} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div
        className={cx("model-grid", `is-${density}`)}
        key={`${filters.category}-${filters.speed}-${filters.size}-${filters.sort}`}
      >
        {empty ? (
          <div className="model-empty">
            <EmptyState
              visual={<EmptyGlyph />}
              title="Nessun modello con questi filtri"
              description="Prova un’altra ricerca o togli un filtro. Il catalogo resta quello adatto a questo PC."
            />
          </div>
        ) : (
          visiblePicks.map((pick, index) => (
            <PickCard
              key={pick.model.id}
              pick={pick}
              featured={density === "cozy" && index === 0}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>

      {set.hiddenCount > 0 && (
        <p className="page-note" style={{ marginTop: 24 }}>
          {set.hiddenCount}{" "}
          {set.hiddenCount === 1
            ? "modello resta fuori: su questo computer non starebbe."
            : "modelli restano fuori: su questo computer non starebbero."}
        </p>
      )}

      <Button variant="ghost" onClick={onToggleAll}>
        {showAll ? "Nascondi i modelli che non stanno" : "Mostra tutto il catalogo"}
      </Button>

      {visibleHidden.length > 0 && (
        <div className={cx("model-grid", `is-${density}`)} style={{ marginTop: 16 }}>
          {visibleHidden.map((model) => (
            <HiddenCard key={model.id} model={model} />
          ))}
        </div>
      )}
    </section>
  );
}
