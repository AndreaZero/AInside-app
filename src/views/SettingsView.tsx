import { useState, type ReactNode } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { useHardwareProfile } from "../hooks/useHardwareProfile";
import { useLibrary } from "../hooks/useLibrary";
import { useSettings } from "../hooks/useSettings";
import { useBackendStatus } from "../layout/useBackendStatus";
import { pickFolder } from "../lib/pickFolder";
import { formatGb } from "../lib/format";
import { ramUsedRatio, performanceFill } from "../lib/resources";
import { cx } from "../lib/cx";
import {
  emptyExpert,
  PROFILE_LABEL,
  type ExpertSettings,
  type PerfProfile,
} from "../lib/settings";
import type { RouteId } from "../navigation/routes";
import { Button, Meter, Toggle } from "../ui/controls";
import {
  IconChat,
  IconCode,
  IconCpu,
  IconFolder,
  IconInfo,
  IconPen,
  IconSettings,
  IconSpark,
} from "../ui/icons";
import { useFeedback } from "../ui/overlays";
import { EmptyState, InlineAlert } from "../ui/states";
import { EmptyGlyph } from "../visuals/DownloadRig";
import { ModelLogo } from "../visuals/ModelLogo";
import { HoloTag } from "./models/tags";

const SECTIONS = [
  { id: "generale", label: "Generale", Icon: IconSettings },
  { id: "prestazioni", label: "Prestazioni", Icon: IconCpu },
  { id: "chat", label: "Chat", Icon: IconChat },
  { id: "codice", label: "Codice", Icon: IconPen },
  { id: "avanzate", label: "Avanzate", Icon: IconSpark },
  { id: "api", label: "API locale", Icon: IconCode },
  { id: "libreria", label: "Libreria", Icon: IconFolder },
  { id: "about", label: "About", Icon: IconInfo },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const PROFILES: { id: PerfProfile; title: string; copy: string; tag: string }[] = [
  { id: "risparmio", title: "Risparmio", copy: "Consuma meno risorse.", tag: "Leggero" },
  { id: "bilanciato", title: "Bilanciato", copy: "Miglior equilibrio tra qualità e velocità.", tag: "Consigliato" },
  { id: "massime", title: "Massime prestazioni", copy: "Usa tutta la potenza disponibile.", tag: "Pieno" },
];

type SettingsViewProps = {
  onNavigate: (route: RouteId) => void;
};

export function SettingsView({ onNavigate }: SettingsViewProps) {
  const [section, setSection] = useState<SectionId>("generale");
  const { theme, setTheme } = useTheme();
  const machine = useHardwareProfile();
  const backend = useBackendStatus();
  const feedback = useFeedback();
  const {
    settings,
    error,
    changeDownloadRoot,
    addRoot,
    removeRoot,
    apiStatus,
    changeProfile,
    changeExpert,
    changeThinking,
    changeApiEnabled,
    grantCoding,
    revokeCoding,
  } = useSettings();
  const apiOn = apiStatus?.enabled ?? settings?.api?.enabled ?? false;
  const expert = settings?.expert ?? emptyExpert();
  const profile = settings?.profile ?? "bilanciato";
  const library = useLibrary();
  const active = library.snapshot?.items.find((item) => item.active);
  const current = SECTIONS.find((item) => item.id === section);

  async function chooseDownloadRoot() {
    const ok = await feedback.confirm({
      title: "Cambiare cartella di download?",
      description: "I nuovi file andranno qui. Quelli già scaricati restano dove sono.",
      confirmLabel: "Scegli cartella",
    });
    if (!ok) return;
    const path = await pickFolder();
    if (path) await changeDownloadRoot(path);
  }

  async function chooseExtraRoot() {
    const path = await pickFolder();
    if (path) await addRoot(path);
  }

  return (
    <section className="page page--wide settings-page">
      <header className="models-hero">
        <p className="page-kicker">Impostazioni</p>
        <h1 className="page-title">Controllo fine, quando serve.</h1>
        <p className="page-note">
          L’app resta semplice. Qui tocchi solo quello che vuoi cambiare.
        </p>
      </header>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Sezioni impostazioni">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx("settings-nav-item", section === item.id && "is-active")}
              onClick={() => setSection(item.id)}
            >
              <item.Icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-stage">
          {section === "generale" && (
            <SettingCard
              kicker={current?.label}
              title="Aspetto"
              note="L’app è pensata per il buio. Il chiaro resta disponibile."
            >
              <div className="holo-row">
                <HoloTag tone={theme === "dark" ? "cyan" : "ghost"}>Scuro</HoloTag>
                <HoloTag tone={theme === "light" ? "amber" : "ghost"}>Chiaro</HoloTag>
              </div>
              <SettingSwitch
                off="Scuro"
                on="Chiaro"
                checked={theme === "light"}
                label="Tema chiaro"
                onChange={(light) => setTheme(light ? "light" : "dark")}
              />
            </SettingCard>
          )}

          {section === "prestazioni" && (
            <>
              <SettingCard
                kicker={current?.label}
                title="Profilo"
                note="Se il modello è già acceso, spegnilo e riaccendilo dopo il cambio."
              >
                <div className="profile-grid">
                  {PROFILES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cx("profile-card", profile === item.id && "is-active")}
                      onClick={() => void changeProfile(item.id)}
                    >
                      <h3>{item.title}</h3>
                      <p>{item.copy}</p>
                      <HoloTag tone={profile === item.id ? "lime" : "ghost"}>
                        {profile === item.id ? "In uso" : item.tag}
                      </HoloTag>
                    </button>
                  ))}
                </div>
              </SettingCard>
              {machine.status === "ready" && (
                <SettingCard title="Risorse di questo PC" note={machine.profile.summary.cpuLine}>
                  <Meter
                    label="CPU"
                    value={performanceFill(machine.profile.performance)}
                    display={PROFILE_LABEL[profile]}
                  />
                  <Meter
                    label="GPU"
                    value={machine.profile.hardware.gpus[0] ? 0.7 : 0.15}
                    display={machine.profile.summary.gpuLine}
                    tone="cyan"
                  />
                  <Meter
                    label="RAM"
                    value={
                      ramUsedRatio(
                        machine.profile.hardware.memory.totalBytes,
                        machine.profile.hardware.memory.availableBytes,
                      ) ?? 0
                    }
                    display={
                      machine.profile.hardware.memory.availableBytes != null
                        ? `${formatGb(machine.profile.hardware.memory.availableBytes)} liberi`
                        : machine.profile.summary.ramLine
                    }
                    tone="success"
                  />
                </SettingCard>
              )}
            </>
          )}

          {section === "chat" && (
            <>
              <SettingCard
                kicker={current?.label}
                title="Ragionamento"
                note="Se acceso, i modelli che sanno ragionare pensano prima di rispondere. In chat puoi anche nascondere il pensiero. Non serve riaccendere il modello."
                live={Boolean(settings?.thinking)}
              >
                <SettingSwitch
                  off="Spento"
                  on="Acceso"
                  checked={Boolean(settings?.thinking)}
                  label="Ragionamento del modello"
                  onChange={(enabled) => void changeThinking(enabled)}
                />
              </SettingCard>
              <SettingCard title="Modello in uso" live={Boolean(active)}>
                {active ? (
                  <div className="settings-model">
                    <ModelLogo
                      seed={active.modelId}
                      source={{ id: active.modelId, name: active.modelName }}
                    />
                    <div>
                      <h3>{active.modelName}</h3>
                      <div className="holo-row">
                        <HoloTag tone="lime">In uso</HoloTag>
                        <HoloTag tone="ghost">Locale</HoloTag>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="model-desc">Nessuno. Sceglilo da Modelli quando è sul disco.</p>
                )}
                <div className="settings-actions">
                  {active ? (
                    <Button variant="danger" onClick={() => void library.clearActive()}>
                      Togli
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => onNavigate("models")}>
                      Modelli
                    </Button>
                  )}
                </div>
              </SettingCard>
            </>
          )}

          {section === "codice" && (
            <SettingCard
              kicker={current?.label}
              title="Scrittura sui file"
              note="Aprire una cartella è solo lettura. Per scrivere, AInside chiede. Puoi fidarti di una cartella, o di tutte."
              live={(settings?.coding?.write ?? "ask") === "always"}
            >
              <SettingSwitch
                off="Chiede"
                on="Può scrivere"
                checked={(settings?.coding?.write ?? "ask") === "always"}
                label="Scrivere in ogni cartella aperta"
                onChange={(enabled) => {
                  void (async () => {
                    if (enabled) {
                      const ok = await feedback.confirm({
                        title: "Permettere la scrittura ovunque?",
                        description:
                          "Il modello potrà modificare i file in ogni cartella che apri in Codice, senza chiedere. I file riservati (.env, chiavi) chiedono comunque.",
                        confirmLabel: "Permetti",
                        danger: true,
                      });
                      if (!ok) return;
                      await grantCoding("always");
                    } else {
                      await grantCoding("ask");
                    }
                  })();
                }}
              />
              <p className="model-desc" style={{ marginTop: 16 }}>
                Cartelle fidate. Qui può scrivere senza chiedere, tranne i file riservati.
              </p>
              {settings?.coding?.trustedFolders && settings.coding.trustedFolders.length > 0 ? (
                <ul className="path-list">
                  {settings.coding.trustedFolders.map((root) => (
                    <li key={root}>
                      <div>
                        <div className="holo-row">
                          <HoloTag tone="lime">Fidata</HoloTag>
                        </div>
                        <p className="path-value">{root}</p>
                      </div>
                      <Button
                        variant="danger"
                        onClick={() => {
                          void feedback
                            .confirm({
                              title: "Togliere questa fiducia?",
                              description: "Prima di scrivere qui, AInside chiederà di nuovo.",
                              confirmLabel: "Togli",
                            })
                            .then((ok) => {
                              if (ok) void revokeCoding(root);
                            });
                        }}
                      >
                        Togli
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="model-desc">
                  Nessuna cartella fidata. Il permesso si dà da Codice, quando il modello vuole
                  scrivere.
                </p>
              )}
            </SettingCard>
          )}

          {section === "avanzate" && (
            <SettingCard
              kicker={current?.label}
              title="Modalità esperto"
              note="Spenta, l’app resta semplice. Accesa, puoi toccare i numeri. Vuoto = automatico."
              live={expert.enabled}
            >
              <SettingSwitch
                off="Spenta"
                on="Accesa"
                checked={expert.enabled}
                label="Modalità esperto"
                onChange={(enabled) => void changeExpert({ ...expert, enabled })}
              />
              {expert.enabled && (
                <ExpertPanel expert={expert} onChange={(next) => void changeExpert(next)} />
              )}
            </SettingCard>
          )}

          {section === "api" && (
            <SettingCard
              kicker={current?.label}
              title="API locale"
              note="Spenta di default. Accesa, Cursor, VS Code e gli script possono usare il modello acceso in Chat."
              live={apiOn}
            >
              <div className="holo-row">
                <HoloTag tone={apiOn ? "lime" : "ghost"}>{apiOn ? "In ascolto" : "Spenta"}</HoloTag>
                <HoloTag tone="cyan" label="URL">
                  {apiStatus?.url ?? "http://localhost:11435"}
                </HoloTag>
              </div>
              {apiStatus?.message ? <p className="model-desc">{apiStatus.message}</p> : null}
              <SettingSwitch
                off="Spenta"
                on="Accesa"
                checked={apiOn}
                label="API locale"
                onChange={(enabled) => {
                  void changeApiEnabled(enabled).then(() => {
                    feedback[enabled ? "success" : "info"](
                      enabled ? "Server API avviato" : "Server API spento",
                    );
                  });
                }}
              />
            </SettingCard>
          )}

          {section === "libreria" && (
            <SettingCard
              kicker={current?.label}
              title="Dove finiscono i modelli"
              note="AInside non li ospita. Li prende da Hugging Face e li scrive qui. Puoi aggiungere cartelle da cui leggere file già tuoi."
            >
              {error && <InlineAlert tone="danger">{error}</InlineAlert>}
              {settings && (
                <ul className="path-list">
                  <li>
                    <div>
                      <div className="holo-row">
                        <HoloTag tone="cyan">Download</HoloTag>
                      </div>
                      <p className="path-value">{settings.library.downloadRoot}</p>
                    </div>
                    <Button onClick={() => void chooseDownloadRoot()}>Cambia</Button>
                  </li>
                  {settings.library.extraRoots.map((root) => (
                    <li key={root}>
                      <div>
                        <div className="holo-row">
                          <HoloTag tone="purple">Libreria</HoloTag>
                        </div>
                        <p className="path-value">{root}</p>
                      </div>
                      <Button
                        variant="danger"
                        onClick={() => {
                          void feedback
                            .confirm({
                              title: "Rimuovere questa cartella?",
                              description: "Smetto di leggerla. I file restano sul disco.",
                              confirmLabel: "Rimuovi",
                            })
                            .then((ok) => {
                              if (ok) void removeRoot(root);
                            });
                        }}
                      >
                        Rimuovi
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {settings && settings.library.extraRoots.length === 0 && (
                <EmptyState
                  visual={<EmptyGlyph />}
                  title="Nessuna cartella aggiuntiva"
                  description="Aggiungi una cartella se hai già dei GGUF altrove."
                />
              )}
              <div className="settings-actions">
                <Button variant="primary" onClick={() => void chooseExtraRoot()}>
                  Aggiungi una cartella
                </Button>
              </div>
            </SettingCard>
          )}

          {section === "about" && (
            <SettingCard kicker="AInside" title="App locale" note="I modelli restano sul tuo computer. Il runtime è llama.cpp.">
              <div className="holo-row">
                <HoloTag tone="cyan">
                  {backend.state === "ready"
                    ? `${backend.name} ${backend.version}`
                    : "Versione in lettura"}
                </HoloTag>
                <HoloTag tone="purple">llama.cpp</HoloTag>
                <HoloTag tone="ghost">Nessun account</HoloTag>
              </div>
              {machine.status === "ready" && (
                <div className="settings-actions">
                  <Button onClick={() => onNavigate("machine")}>Apri analisi computer</Button>
                </div>
              )}
            </SettingCard>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingCard({
  kicker,
  title,
  note,
  live,
  children,
}: {
  kicker?: string;
  title: string;
  note?: string;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={cx("settings-card", live && "is-live")}>
      <div className="model-card-shine" aria-hidden />
      <header className="settings-card-head">
        {kicker ? <p className="page-kicker">{kicker}</p> : null}
        <h2>{title}</h2>
        {note ? <p className="model-desc">{note}</p> : null}
      </header>
      {children}
    </article>
  );
}

function SettingSwitch({
  off,
  on,
  checked,
  label,
  onChange,
}: {
  off: string;
  on: string;
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="settings-switch">
      <span className={cx(!checked && "is-current")}>{off}</span>
      <Toggle checked={checked} label={label} onChange={onChange} />
      <span className={cx(checked && "is-current")}>{on}</span>
      <HoloTag tone={checked ? "lime" : "ghost"}>{checked ? on : off}</HoloTag>
    </div>
  );
}

function ExpertPanel({
  expert,
  onChange,
}: {
  expert: ExpertSettings;
  onChange: (expert: ExpertSettings) => void;
}) {
  return (
    <div className="expert-grid">
      <ExpertField
        label="Temperatura"
        value={expert.temperature}
        onChange={(value) => onChange({ ...expert, temperature: value })}
      />
      <ExpertField
        label="top_p"
        value={expert.topP}
        onChange={(value) => onChange({ ...expert, topP: value })}
      />
      <ExpertField
        label="top_k"
        value={expert.topK}
        integer
        onChange={(value) => onChange({ ...expert, topK: value })}
      />
      <ExpertField
        label="min_p"
        value={expert.minP}
        onChange={(value) => onChange({ ...expert, minP: value })}
      />
      <ExpertField
        label="Repeat penalty"
        value={expert.repeatPenalty}
        onChange={(value) => onChange({ ...expert, repeatPenalty: value })}
      />
      <ExpertField
        label="Contesto"
        value={expert.context}
        integer
        onChange={(value) => onChange({ ...expert, context: value })}
      />
      <ExpertField
        label="Thread"
        value={expert.threads}
        integer
        onChange={(value) => onChange({ ...expert, threads: value })}
      />
      <ExpertField
        label="Batch"
        value={expert.batch}
        integer
        onChange={(value) => onChange({ ...expert, batch: value })}
      />
      <ExpertField
        label="GPU offload"
        value={expert.gpuLayers}
        integer
        onChange={(value) => onChange({ ...expert, gpuLayers: value })}
      />
      <ExpertField
        label="Seed"
        value={expert.seed}
        integer
        onChange={(value) => onChange({ ...expert, seed: value })}
      />
      <label className="expert-field">
        <span>Flash attention</span>
        <select
          className="expert-input"
          value={expert.flashAttention == null ? "" : expert.flashAttention ? "on" : "off"}
          onChange={(event) => {
            const raw = event.target.value;
            onChange({
              ...expert,
              flashAttention: raw === "" ? null : raw === "on",
            });
          }}
        >
          <option value="">Automatico</option>
          <option value="on">Accesa</option>
          <option value="off">Spenta</option>
        </select>
      </label>
      <label className="expert-field">
        <span>Cache KV</span>
        <select
          className="expert-input"
          value={expert.kvCache ?? ""}
          onChange={(event) =>
            onChange({ ...expert, kvCache: event.target.value || null })
          }
        >
          <option value="">Automatico</option>
          <option value="f16">f16</option>
          <option value="q8_0">q8_0</option>
          <option value="q4_0">q4_0</option>
        </select>
      </label>
      <label className="expert-field expert-field-wide">
        <span>System prompt</span>
        <textarea
          className="expert-input expert-prompt"
          rows={3}
          value={expert.systemPrompt ?? ""}
          placeholder="Vuoto: il modello si presenta con il suo nome. AInside resta solo l’app."
          onChange={(event) =>
            onChange({ ...expert, systemPrompt: event.target.value || null })
          }
        />
      </label>
    </div>
  );
}

function ExpertField({
  label,
  value,
  integer = false,
  onChange,
}: {
  label: string;
  value?: number | null;
  integer?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="expert-field">
      <span>{label}</span>
      <input
        className="expert-input"
        inputMode={integer ? "numeric" : "decimal"}
        placeholder="Automatico"
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value.trim().replace(",", ".");
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}
