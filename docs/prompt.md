> Visione di prodotto. Per chi usa o scarica l’app: [README](../README.md) e [guida](guida.md).

Crea un'app desktop multipiattaforma, inizialmente focalizzata su **Windows**, simile concettualmente a LM Studio e Ollama ma progettata per essere **molto più semplice, automatica e accessibile**, con interfaccia completamente in italiano.

L'obiettivo è permettere anche a un utente non tecnico di eseguire modelli AI in locale senza dover conoscere GGUF, quantizzazioni, GPU layers, context size o configurazioni hardware.

## Obiettivo principale

Il flusso ideale deve essere:

**Apri app → analisi automatica del PC → modelli consigliati → Scarica e usa → Chat.**

La piattaforma deve occuparsi automaticamente della configurazione tecnica.

## Stack consigliato

* Tauri 2
* React
* TypeScript
* Rust
* `llama.cpp` come runtime principale per l'inferenza locale
* Supporto iniziale GGUF
* Architettura modulare per poter aggiungere altri runtime in futuro

Non implementare un inference engine proprietario da zero.

## 1. Analisi automatica hardware

Al primo avvio rileva:

* CPU
* core/thread
* RAM totale e disponibile
* GPU
* VRAM
* NVIDIA / AMD / Intel
* spazio libero su disco
* sistema operativo
* backend disponibili come CUDA, Vulkan o CPU

Mostra queste informazioni in maniera semplice, ad esempio:

**Il tuo PC**
RTX 4070 — 12 GB VRAM
32 GB RAM
Ryzen 7 7800X3D

**Prestazioni AI: Ottime**

I dettagli tecnici completi possono essere nascosti dietro "Mostra dettagli".

## 2. Sistema automatico di compatibilità

Crea un motore che, in base alle specifiche hardware, stabilisca quali modelli possono essere eseguiti bene.

Deve considerare almeno:

* dimensione modello
* quantizzazione
* RAM necessaria
* VRAM necessaria
* KV cache
* context size
* overhead runtime
* GPU offload
* spazio disco

Il sistema non deve limitarsi a verificare se il modello "parte", ma deve stimare se offrirà un'esperienza realmente utilizzabile.

## 3. Catalogo modelli semplificato

L'utente non deve vedere inizialmente una lista tecnica di file GGUF.

Mostra una sezione:

### Consigliati per il tuo PC

Ogni modello deve avere una scheda semplice con:

* nome
* dimensione
* descrizione
* qualità generale
* qualità italiano
* coding
* ragionamento
* velocità prevista sul PC dell'utente
* spazio richiesto

Categorie:

* Generale
* Programmazione
* Scrittura
* Ragionamento
* Leggeri
* Visione, quando supportata

Mantieni i dettagli come quantizzazione, formato e autore sotto una sezione "Avanzate".

## 4. Download intelligente

Quando esistono più quantizzazioni dello stesso modello, l'app deve scegliere automaticamente quella più adatta al PC.

Esempio:

RTX 3060 12 GB + 32 GB RAM

→ selezione automatica di una quantizzazione che massimizzi qualità senza saturare VRAM/RAM.

Mostra una spiegazione semplice:

> Abbiamo scelto questa versione perché offre il miglior equilibrio tra qualità e velocità sul tuo computer.

L'utente avanzato deve comunque poter cambiare manualmente variante.

## 5. Configurazione automatica runtime

Prima di avviare il modello calcola una stima della memoria:

* peso modello
* KV cache
* runtime overhead
* context
* batch
* GPU allocation

Evita configurazioni che potrebbero causare Out Of Memory.

Se necessario adatta automaticamente, in ordine ragionato:

* context size
* batch size
* GPU offload
* altre impostazioni runtime

Mostra solamente il risultato finale all'utente normale.

## 6. Profili prestazioni

Implementa tre modalità semplici:

### Risparmio

Utilizza meno RAM/GPU e mantiene il PC più reattivo.

### Bilanciato

Configurazione automatica consigliata.

### Massime prestazioni

Utilizza una porzione maggiore delle risorse disponibili per ottenere la migliore velocità.

Il profilo Bilanciato deve essere quello predefinito.

## 7. Chat

Interfaccia estremamente semplice.

Sidebar:

* Nuova chat
* Chat precedenti
* Modelli
* Download
* Impostazioni

Nella chat mostra solamente:

**Modello attivo — Stato locale**

Input classico con streaming della risposta.

Supporta:

* cronologia conversazioni
* system prompt
* stop generation
* regenerate
* copia risposta
* cambio modello

## 8. Modalità Esperto

In Impostazioni aggiungi:

**Modalità esperto**

Quando attivata mostra configurazioni come:

* temperature
* top_p
* top_k
* min_p
* repeat penalty
* context
* threads
* batch size
* GPU offload
* flash attention
* KV cache
* seed
* system prompt

Queste impostazioni non devono interferire con la semplicità della modalità standard.

## 9. API locale

Integra fin dall'inizio un server API locale opzionale.

Esempio:

`http://localhost:11435`

Compatibilità iniziale con formato OpenAI:

* `GET /v1/models`
* `POST /v1/chat/completions`

Supporta streaming.

L'obiettivo è poter utilizzare i modelli locali anche da:

* Cursor
* VS Code
* Python
* Node.js
* MCP
* agent
* software esterni

## 10. UX

Il principio fondamentale è:

**nascondere la complessità, non eliminarne le possibilità.**

Un utente normale deve poter utilizzare l'app senza conoscere:

* GGUF
* Q4/Q5
* CUDA
* GPU layers
* KV cache
* token context

Un utente esperto deve invece poter accedere a queste impostazioni.

Design:

* premium
* minimale
* molto pulito
* pochi elementi
* niente dashboard sovraccariche
* linguaggio italiano semplice
* feedback chiari sul consumo hardware

## MVP

Implementare inizialmente:

1. Hardware detection
2. Sistema di valutazione hardware
3. Catalogo curato di modelli
4. Compatibilità modello/hardware
5. Download GGUF
6. Gestione download
7. integrazione llama.cpp
8. configurazione automatica runtime
9. chat locale con streaming
10. gestione modelli installati
11. tre profili prestazioni
12. modalità esperto
13. API OpenAI-compatible locale
14. persistenza delle impostazioni e delle chat

## Principio di prodotto

La caratteristica distintiva deve essere:

> **L'utente non deve scegliere quale quantizzazione o configurazione usare. L'app deve capire cosa può gestire il suo computer e proporre automaticamente la soluzione migliore.**

Non creare semplicemente un clone dell'interfaccia di LM Studio.

Progettare l'app intorno al concetto:

**“Dimmi cosa vuoi fare. Al resto pensa il software.”**

Durante l'implementazione privilegia:

* architettura modulare
* stabilità
* sicurezza
* gestione robusta degli errori
* cancellazione sicura dei download
* verifica integrità dei modelli
* reporting chiaro degli errori runtime
* possibilità futura di aggiungere modelli multimodali e altri inference backend
