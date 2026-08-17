# AInside — backlog task

Lavora **un task alla volta**, in ordine. Ogni task deve lasciare il progetto compilabile in teoria (l’agente non lancia comandi).

Stato: `todo` | `doing` | `done`

---

## Fase 0 — Fondazione

### T00 — Bootstrap progetto
Stato: `done`

Tauri 2 + React + TypeScript + Rust. Nome app: AInside. Window desktop Windows-first. Script/readme con i comandi da lanciare (senza eseguirli). Struttura cartelle prevista in `AGENTS.md`. Lingua UI: italiano. Tema minimale scuro/chiaro pronto ma semplice.

### T01 — Shell UI e navigazione
Stato: `done`

Layout: sidebar + area principale. Voci: Chat, Modelli, Download, Impostazioni. Schermata vuota “Nuova chat”. Nessuna logica inferenza. Copy italiano, UI pulita.

---

## Fase 1 — Hardware e consiglio

### T02 — Rilevamento hardware (Rust)
Stato: `done`

Comando Tauri che restituisce: CPU, core/thread, RAM tot/disponibile, GPU, VRAM, vendor (NVIDIA/AMD/Intel), disco libero, OS, backend (CUDA/Vulkan/CPU) se rilevabili. Fallback sicuri se un dato manca.

### T03 — Vista “Il tuo PC” + punteggio
Stato: `done`

Schermata primo avvio / Impostazioni: riepilogo semplice (es. RTX 4070 — 12 GB, 32 GB RAM, Ryzen 7) e “Prestazioni AI: …”. Dettagli tecnici dietro “Mostra dettagli”. Motore di score in Rust (regole esplicite, testabili).

### T04 — Catalogo curato
Stato: `done`

Catalogo statico/versionato (non lista GGUF grezza). Metadati: nome, descrizione, categorie, qualità, varianti GGUF, stats Hugging Face (download, preferiti) e bench ufficiali se pubblicati. UI: “Per questo PC”, ricerca, filtri, Avanzate pieghevoli.

### T05 — Motore compatibilità + scelta quant
Stato: `done`

Dato hardware + modello, stima se è usabile e quale variante scaricare. Output: raccomandata, alternative, motivo in italiano, velocità prevista, spazio. Default = miglior equilibrio qualità/velocità senza saturare RAM/VRAM. Catalogo unico per tutti; la lista “Per questo PC” si calcola a runtime sul computer di chi apre l’app.

---

## Fase 2 — Download e modelli

### T06 — Download GGUF
Stato: `done`

Download diretto da Hugging Face (AInside non hosta i file). Progresso, annullo sicuro, resume, verifica integrità. Destinazione: cartella predefinita o path custom; più librerie (cartelle extra da scansionare). Errori chiari in italiano.

### T07 — Gestione modelli installati
Stato: `done`

Lista installati, spazio usato, elimina, “usa questo modello”, stato (scaricato / incompleto / corrotto).

---

## Fase 3 — Runtime e chat

### T08 — Integrazione llama.cpp
Stato: `done`

Adapter runtime: avvio/stop processo o lib, caricamento GGUF, streaming token verso il frontend. Nessun engine custom. Errori runtime riportati in modo chiaro.

### T09 — Config automatica + profili
Stato: `done`

Prima del load: stima memoria (pesi, KV, overhead, context, batch, GPU). Adatta in ordine: context → batch → offload → resto. Profili Risparmio / Bilanciato (default) / Massime prestazioni. UI normale: solo esito. Niente OOM evitabili.

### T10 — Chat locale
Stato: `done`

Chat con modello attivo, badge “Stato locale”, input, streaming, stop, regenerate, copia, cambio modello. System prompt interno. Persistenza chat e impostazioni.

---

## Fase 4 — Esperto e API

### T11 — Modalità esperto
Stato: `done`

Toggle in Impostazioni. Se on: temperature, top_p, top_k, min_p, repeat penalty, context, threads, batch, GPU offload, flash attention, KV cache, seed, system prompt. Se off: UI invariata.

### T12 — API OpenAI-compatible
Stato: `done`

Server locale opzionale `http://localhost:11435`: `GET /v1/models`, `POST /v1/chat/completions` + streaming. Off di default. Pensato per Cursor, VS Code, script, MCP.

---

## Fase 5 — Modalità Codice

Piano: [`docs/plan-coding.md`](plan-coding.md). **Non implementare** finché non si parte da T13. Poi un task alla volta. Visione e ricerca web sono in pausa (vedi «Dopo»).

### T13 — Codice: guscio
Stato: `done`

Route `code`, tasto sidebar **Codice** (riga, come Nuova chat). Elenco sessioni filtrato per `kind`. Empty «Apri una cartella» con `pickFolder`. `ChatSession.kind` + `workspacePath`, JSON vecchio = chat. Niente lettura file, niente write.

### T14 — Codice: disco in lettura
Stato: `done`

Modulo `workspace/`: tree, read, search. Solo sotto la root, ignore `node_modules`/`.git`, cap 64 KB. Albero + anteprima sola lettura + `@` nel composer.

### T15 — Codice: giro agente
Stato: `done`

Pack context + prompt corto. Marker `LEGGI:` max 4 a messaggio. Stream in CodeView. Stesso llama.cpp della chat. Niente write.

### T16 — Codice: scrittura e permessi
Stato: `done`

Parse blocchi cerca/sostituisci. Permessi `ask` | `session` | `folder` | `always`. Segreti sempre `ask`. Write atomico, toast + Annulla. Carte in chat.

---

## Dopo (non toccare ora)

- Visione / mmproj
- Ricerca web (DuckDuckGo)
- macOS / Linux first-class
- Altri backend oltre llama.cpp
- Catalogo remoto aggiornabile
- Generazione immagini
- Terminale / git in modalità codice (stesso schema permessi)
