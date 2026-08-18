# AInside — istruzioni per l’agente

App desktop locale per eseguire modelli AI senza configurazione tecnica.  
Non è un clone di LM Studio: l’utente dice cosa vuole fare, il software sceglie quantizzazione, runtime e risorse.

Documentazione pubblica (README, guida, privacy, API, release): `README.md` e `docs/README.md`.  
Fonte di prodotto: `docs/prompt.md`. Backlog implementativo: `docs/tasks.md`.

## Principio

> L’utente non deve scegliere quantizzazione o configurazione. L’app deve capire cosa può gestire il PC e proporre la soluzione migliore.

Nascondere la complessità, non eliminarne le possibilità.

## Come lavorare

1. Sviluppo **un task alla volta** da `docs/tasks.md`, nell’ordine indicato.
2. Prima di un task: leggi questo file, il task e i file già toccati da quel modulo.
3. Alla fine del task: elenca file creati/modificati, cosa manca, e il comando da lanciare (senza eseguirlo).
4. Non anticipare task successivi se non è strettamente necessario per far compilare.
5. **Non lanciare comandi, install, build, dev server o test.** Scrivi solo cosa deve fare l’utente.
6. Non committare se non richiesto.

## Stack

- Tauri 2, React, TypeScript, Rust
- Runtime inferenza: `llama.cpp` (GGUF). Nessun engine proprietario.
- Architettura a plugin/runtime: oggi llama.cpp, domani altri backend.
- UI interamente in italiano. Target iniziale: Windows.

## Architettura

```
src/                 UI React (italiano, minimale)
src-tauri/           Rust: hardware, download, runtime, API, persistenza
  hardware/          rilevamento CPU/GPU/RAM/disco/backend
  catalog/           catalogo curato + metadati utente-friendly
  compatibility/     stima fattibilità e qualità d’uso sul PC
  download/          download GGUF, cancel, integrità
  runtime/           adapter llama.cpp + config automatica
  chat/              sessioni, streaming, persistenza
  api/               server OpenAI-compatible opzionale
```

- UI parla solo in termini semplici. Dettagli GGUF/Q4/CUDA/layers dietro “Avanzate” o Modalità esperto.
- Rust possiede hardware, file, processo inferenza, API locale.
- Frontend non calcola compatibilità: chiede al backend e mostra il risultato.
- Errori runtime: messaggio chiaro in italiano + dettaglio tecnico pieghevole.

## Prodotto (vincoli)

**Flusso:** Apri app → analisi PC → modelli consigliati → Scarica e usa → Chat.

**Hardware:** al primo avvio rileva CPU, core/thread, RAM tot/libera, GPU, VRAM, vendor, disco, OS, backend (CUDA / Vulkan / CPU). Vista semplice + “Mostra dettagli”. Punteggio tipo “Prestazioni AI: Ottime”.

**Compatibilità:** non basta “parte”. Stima esperienza reale: size, quant, RAM/VRAM, KV cache, context, overhead, offload, disco.

**Catalogo:** schede semplici (nome, size, descrizione, qualità, italiano, coding, ragionamento, velocità prevista, spazio). Categorie: Generale, Programmazione, Scrittura, Ragionamento, Leggeri, Visione. Quant/formato/autore in Avanzate.

**Catalogo = fatti vivi, non memoria.** Prima di aggiungere o aggiornare un modello: cerca su Hugging Face (API tree) repo GGUF attuali (Unsloth / bartowski / ufficiale), verifica che il file esista, copia `size` e SHA256 dal LFS, usa URL `resolve/main`. Vietato riusare famiglie superate (es. Qwen 2.5, Llama 3.2) se esiste una generazione successiva stabile. Data di verifica in `updatedAt`.

**Download:** AInside non hosta i GGUF. Il catalogo contiene URL pubblici (Hugging Face `resolve`). Il client scarica dal CDN al disco dell’utente. Sceglie in automatico la quantizzazione. Testo: *“Abbiamo scelto questa versione perché offre il miglior equilibrio tra qualità e velocità sul tuo computer.”* Override manuale per esperti. Cancel sicuro + verifica integrità.

**Libreria:** l’utente sceglie dove salvare (cartella di download) e può aggiungere altre cartelle da cui leggere modelli già presenti. Default: `{appData}/models`. Nessun account, nessun nostro server.

**Runtime:** prima dell’avvio stima memoria (pesi, KV, overhead, context, batch, GPU). Evita OOM. Adatta in ordine: context → batch → GPU offload → altre. All’utente normale solo il risultato.

**Profili:** Risparmio | Bilanciato (default) | Massime prestazioni.

**Chat:** sidebar (Nuova chat, cronologia, Modelli, Download, Impostazioni). In chat: modello attivo, stato locale, input, streaming. Supporta cronologia, system prompt, stop, regenerate, copia, cambio modello.

**Esperto:** temperature, top_p, top_k, min_p, repeat penalty, context, threads, batch, GPU offload, flash attention, KV cache, seed, system prompt. Non inquina la UI standard.

**API locale opzionale:** `http://localhost:11435` — `GET /v1/models`, `POST /v1/chat/completions` + streaming. Per Cursor, VS Code, script, MCP, agent.

**UX:** premium, minimale, pochi elementi, italiano semplice, feedback su consumo hardware.

## Qualità

- Modulare, stabile, errori espliciti, cancel download sicuro, checksum modelli.
- Pronto per multimodale e altri backend, senza implementarli ora.
- Nessuna dashboard sovraccarica. Nessun gergo in vista normale.

## Fuori scope finché non è nel task

Altri OS oltre Windows (struttura ok, focus Windows). Engine custom. Catalogo Hugging Face grezzo. Autostart cloud. Account utente.
