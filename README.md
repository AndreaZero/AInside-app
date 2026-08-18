<p align="center">
  <img src="docs/assets/hero.svg" alt="AInside — modelli AI in locale" width="800" />
</p>

<p align="center">
  <a href="https://github.com/AndreaZero/AInside-app/releases"><img src="https://img.shields.io/github/v/release/AndreaZero/AInside-app?include_prereleases&label=release" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licenza-MIT-3b82f6" alt="Licenza MIT" /></a>
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/stato-anteprima-8b5cf6" alt="Anteprima" />
</p>

# AInside

App desktop per **eseguire modelli AI sul tuo computer**, senza account e senza mandare le conversazioni su un server nostro.

Non è un clone di LM Studio. Tu dici cosa vuoi fare: l’app guarda il PC, sceglie la versione del modello, configura il motore e apre la chat.

> **Dimmi cosa vuoi fare. Al resto pensa il software.**

Interfaccia in italiano. Prima piattaforma: **Windows**. Motore: [llama.cpp](https://github.com/ggml-org/llama.cpp) (GGUF).

## Perché esiste

Usare un modello in locale oggi significa spesso scegliere file GGUF, quantizzazioni, layer GPU, context, CUDA o Vulkan. Per chi non vive di questo, è rumore.

AInside nasconde quella complessità — **non la toglie**. In vista normale vedi esito e azione. Se sei esperto, le stesse leve stanno in Impostazioni.

## Come funziona

```text
Apri l’app → analisi del PC → modelli consigliati → Scarica e usa → Chat
```

1. **Il tuo PC** — CPU, RAM, GPU, spazio disco, backend disponibili. Un punteggio tipo «Prestazioni AI: Ottime», dettagli dietro «Mostra dettagli».
2. **Consigliati per il tuo PC** — schede semplici: a cosa serve, quanto è bravo in italiano / codice / ragionamento, quanto occupa, quanto andrà veloce *su quella macchina*.
3. **Download** — i file arrivano da Hugging Face. AInside non li ospita. Sceglie da sola la variante; puoi cambiarla in Avanzate.
4. **Runtime** — prima di accendere il modello stima la memoria e adatta context, batch e offload. Tre profili: Risparmio, Bilanciato (predefinito), Massime prestazioni.
5. **Chat e Codice** — conversazione in locale, oppure apri una cartella e fai lavorare il modello sui file (con permesso).

## Cosa fa oggi

| | |
| --- | --- |
| Chat | Streaming, stop, rigenera, copia, cronologia, system prompt interno |
| Catalogo | Famiglie attuali (Qwen, Gemma, …), non un elenco grezzo di file |
| Download | Progresso, annullo, ripresa, controllo integrità |
| Libreria | Cartella di download + altre cartelle già tue |
| Codice | Albero, lettura, modifiche con conferma, terminale nella cartella |
| Esperto | Temperature, context, thread, GPU offload, flash attention, … |
| API | Server locale opzionale compatibile OpenAI, per Cursor, VS Code, script |

## Cosa non è

- Un servizio cloud e **non** un account AInside
- Un IDE (niente tab, git, Language Server)
- Un motore di inferenza proprietario: usa llama.cpp ufficiale
- Pronto per macOS / Linux come prodotto (la struttura c’è, il focus è Windows)

## Installare (Windows)

1. Apri le [**Release**](https://github.com/AndreaZero/AInside-app/releases).
2. Scarica l’installer (`.exe` NSIS).
3. Avvia AInside. Al primo uso analizza il PC e ti propone un modello.

Windows SmartScreen può avvisare finché l’installer non è firmato: *Altre informazioni* → *Esegui comunque*, se hai scaricato da questo repository.

I modelli pesano da pochi GB in su. Servono spazio disco e, per i modelli grandi, RAM/VRAM adeguate: l’app te lo dice prima.

Guida passo passo: [docs/guida.md](docs/guida.md).

## API locale

Spenta di default. In Impostazioni → API locale la accendi. Poi, con un modello acceso in Chat:

```http
GET  http://localhost:11435/v1/models
POST http://localhost:11435/v1/chat/completions
```

Esempi per Cursor, Python e `curl`: [docs/api.md](docs/api.md).

## Privacy

Nessun login. Chat, impostazioni e modelli restano sul disco. L’API ascolta solo `127.0.0.1`. Dettaglio: [docs/privacy.md](docs/privacy.md).

## Compilare da sorgente

Serve Windows 10/11, Node.js 20+, Rust stable, strumenti C++ di Visual Studio, WebView2.

```powershell
npm install
.\scripts\fetch-icons.ps1
npm run tauri dev
```

Build dell’installer:

```powershell
npm run tauri build
```

Istruzioni complete: [docs/sviluppo.md](docs/sviluppo.md). Come tagliare una release: [docs/rilascio.md](docs/rilascio.md).

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [docs/README.md](docs/README.md) | Indice |
| [docs/guida.md](docs/guida.md) | Uso quotidiano |
| [docs/api.md](docs/api.md) | API OpenAI-compatible |
| [docs/privacy.md](docs/privacy.md) | Dati, rete, cosa esce dal PC |
| [docs/architettura.md](docs/architettura.md) | Come è fatto il programma |
| [docs/roadmap.md](docs/roadmap.md) | Cosa c’è, cosa manca |
| [docs/rilascio.md](docs/rilascio.md) | Versionamento e GitHub Releases |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Come contribuire |

La visione di prodotto originale è in [docs/prompt.md](docs/prompt.md).

## Contribuire

Issue e pull request sono benvenute, in italiano. Leggi [CONTRIBUTING.md](CONTRIBUTING.md) e il [codice di condotta](CODE_OF_CONDUCT.md).

## Licenza

[MIT](LICENSE). I **modelli** che scarichi hanno licenze proprie (Apache, Gemma, …): rispettale. Vedi [NOTICE](NOTICE).

Ringraziamenti: [llama.cpp](https://github.com/ggml-org/llama.cpp), [Hugging Face](https://huggingface.co/), e chi pubblica i GGUF (Unsloth, bartowski, repo ufficiali).
