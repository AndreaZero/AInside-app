# Sviluppo

Come compilare AInside sul tuo Windows. I comandi li lanci tu; in questo repository l’agente di Cursor **non** deve eseguirli (vedi [AGENTS.md](../AGENTS.md)).

## Requisiti

- Windows 10/11
- [Node.js](https://nodejs.org/) 20 o successivo
- [Rust](https://rustup.rs/) stable
- Visual Studio Build Tools con carico C++
- WebView2 (di solito già su Windows 11)
- Git

## Prima volta

```powershell
git clone https://github.com/AndreaZero/AInside-app.git
cd AInside-app
npm install
.\scripts\fetch-icons.ps1
```

Lo script delle icone scarica il set Tauri di default se `src-tauri/icons` è vuoto. Per una release pubblica conviene sostituirle con un’icona di brand (vedi [rilascio.md](rilascio.md)).

## Avvio in sviluppo

```powershell
npm run tauri dev
```

Apre la finestra Tauri e Vite su `http://localhost:1420`.

Solo frontend (senza Rust), se stai iterando sulla UI:

```powershell
npm run dev
```

Senza il backend i comandi Tauri non funzionano.

## Installer

```powershell
npm run tauri build
```

L’artefatto NSIS finisce sotto `src-tauri\target\release\bundle\nsis\`.

## Test Rust

Dalla cartella `src-tauri`:

```powershell
cargo test
```

## Struttura utile

| Percorso | Ruolo |
| --- | --- |
| `src/` | React, italiano |
| `src-tauri/src/` | Moduli Rust |
| `src-tauri/src/catalog/models.json` | Catalogo |
| `docs/tasks.md` | Un task alla volta, in ordine |
| `docs/prompt.md` | Vincoli di prodotto |
| `docs/design.md` | UI |

## Convenzioni

- UI in italiano, gergo (GGUF, Q4, CUDA) solo in Avanzate / Esperto
- Un task di `docs/tasks.md` per volta; non anticipare i successivi se non serve a compilare
- Catalogo: verificare su Hugging Face che il file esista, copiare size e SHA-256, `updatedAt` del giorno
- Non committare `.env`, chiavi, GGUF, `node_modules`, `target/`

Pull request: [CONTRIBUTING.md](../CONTRIBUTING.md).
