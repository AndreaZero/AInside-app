# Registro modifiche

Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).
Il versionamento segue [SemVer](https://semver.org/lang/it/).

## [Non pubblicato]

## [0.1.0] - 2026-08-18

Prima anteprima pubblica. Windows 10/11. L’app analizza il PC, consiglia un modello, lo scarica e avvia la chat in locale.

### Aggiunto

- Rilevamento hardware (CPU, RAM, GPU, VRAM, disco, backend CUDA / Vulkan / CPU) e punteggio «Prestazioni AI»
- Catalogo curato di modelli GGUF, con scelta automatica della variante adatta al computer
- Download da Hugging Face: progresso, annullo, ripresa, verifica SHA-256
- Libreria modelli (cartella di download + cartelle extra)
- Runtime llama.cpp ufficiale, con stima memoria e profili Risparmio / Bilanciato / Massime prestazioni
- Chat locale con streaming, stop, rigenera, copia, cronologia
- Modalità Codice: apri una cartella, leggi e modifica file con permessi, terminale nella root
- Modalità esperto (temperature, context, offload, …) nascosta di default
- API locale opzionale OpenAI-compatible su `http://localhost:11435`
- Interfaccia in italiano, tema scuro/chiaro

### Note

- macOS e Linux non sono ancora un obiettivo di prodotto
- Visione (immagini in chat) e ricerca web sono in roadmap, non in questa versione
- L’installer non include i modelli né llama.cpp: li prende al bisogno

[Non pubblicato]: https://github.com/AndreaZero/AInside-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AndreaZero/AInside-app/releases/tag/v0.1.0
