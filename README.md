# AInside

App desktop per eseguire modelli AI in locale. Apri, il software legge il PC, ti consiglia cosa scaricare, chat.

Interfaccia in italiano. Windows per primo. Nessuna configurazione tecnica in vista normale.

## Requisiti

- Windows 10/11
- [Node.js](https://nodejs.org/) 20 o successivo
- [Rust](https://rustup.rs/) (stable) + Visual Studio Build Tools (C++)
- WebView2 (di solito già presente su Windows 11)

## Avvio (da lanciare tu)

Dalla cartella del progetto:

```powershell
npm install
```

Icone Tauri (necessarie al primo `tauri dev` / `tauri build`). Crea la cartella e scarica il set di default:

```powershell
New-Item -ItemType Directory -Force -Path src-tauri\icons | Out-Null
$base = "https://raw.githubusercontent.com/tauri-apps/create-tauri-app/dev/templates/_base_/src-tauri/icons"
@(
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.icns",
  "icon.ico",
  "icon.png"
) | ForEach-Object {
  Invoke-WebRequest -Uri "$base/$_" -OutFile "src-tauri\icons\$_"
}
```

Poi:

```powershell
npm run tauri dev
```

Build installer:

```powershell
npm run tauri build
```

## Struttura

- `src/` — UI React (italiano)
- `src-tauri/` — Rust: hardware, catalogo, download, runtime, chat, API
- `docs/prompt.md` — brief di prodotto
- `docs/tasks.md` — backlog
- `AGENTS.md` — regole di sviluppo

## Principio

L’utente non sceglie quantizzazione o layer GPU. L’app sceglie per il suo computer.
