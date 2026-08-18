# Architettura

AInside è un’app [Tauri 2](https://tauri.app/): finestra desktop Windows, UI in React, nucleo in Rust. L’inferenza non è un motore scritto da noi: è **llama.cpp** ufficiale, avviato come processo.

## Principio

La UI parla in italiano semplice. Hardware, file, processo, API e permessi sul disco stanno in Rust. Il frontend **non** calcola se un modello sta sul PC: chiede al backend e mostra il risultato.

```text
src/                 interfaccia React (italiano, minimale)
src-tauri/           Rust
  hardware/          CPU, GPU, RAM, disco, backend
  catalog/           catalogo curato (JSON) + metadati leggibili
  compatibility/     stima fattibilità e qualità d’uso
  download/          GGUF, annullo, integrità
  library/           modelli sul disco
  runtime/           llama.cpp + config automatica
  chat/              sessioni, streaming, persistenza
  workspace/         codice: albero, lettura, scrittura, terminale
  api/               server OpenAI-compatible opzionale
  settings/          profili, esperto, cartelle, API
```

## Flusso inferenza

1. Catalogo + hardware → motore di compatibilità → variante consigliata.
2. Download (se manca) verso la libreria.
3. Stima memoria (pesi, KV, overhead, context, batch, GPU) e adattamento: context → batch → offload → resto.
4. Se manca o è vecchio, download dello zip llama.cpp (Vulkan o CPU).
5. Avvio `llama-server`, streaming token verso la UI (e, se accesa, verso l’API su `127.0.0.1:11435`).

## Catalogo

Il catalogo è un file versionato, non una ricerca grezza su Hugging Face. Prima di aggiungere un modello si verificano repo GGUF attuali, size e SHA-256 LFS, URL `resolve/main`. Data in `updatedAt`. Niente famiglie superate se esiste una generazione stabile successiva.

AInside **non hosta** i GGUF.

## Sicurezza (forma)

- La UI non ha permesso `fs` Tauri: lista, lettura e scrittura passano da Rust, sotto la root della cartella aperta.
- Segreti e `.env`: permesso di scrittura sempre chiesto.
- API solo localhost.
- Errori: messaggio italiano + dettaglio pieghevole / Diagnostica.

## Estensioni future

L’adapter runtime è il punto in cui, un giorno, possono entrare altri backend. Oggi c’è solo llama.cpp. Visione, ricerca web, macOS/Linux: [roadmap.md](roadmap.md).
