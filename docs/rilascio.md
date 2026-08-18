# Rilascio

Come si pubblica AInside: versione, tag git, GitHub Release, installer Windows.

Oggi **non** c’è aggiornamento in-app. Chi usa l’app scarica il file dalla pagina [Releases](https://github.com/AndreaZero/AInside-app/releases).

## Rendere pubblico il repository

Su GitHub:

1. Repo **AInside-app** → **Settings** → **General** → **Danger zone** → **Change repository visibility** → **Public**.
2. In **Settings** → **General**: descrizione  
   `Modelli AI in locale sul PC. Analizza l’hardware, sceglie il modello, configura il runtime. Interfaccia in italiano.`
3. Topics suggeriti: `tauri`, `llama-cpp`, `local-llm`, `gguf`, `windows`, `desktop`, `italiano`, `openai-compatible`.
4. **Releases** attive; **Issues** attive; **Discussions** se ti servono domande libere.
5. **Settings** → **Code security** → abilita **Private vulnerability reporting**.
6. (Opzionale) **Social preview**: carica `docs/assets/hero.svg` esportato in PNG 1280×640.

Controlla che non ci siano segreti nel git (`gh secret`, `.env`, chiavi di firma). I piani in `docs/plan-*.md` sono bozze: il [piano admin](plan-admin.md) **non** è implementato.

## Numero di versione

SemVer, anteprima `0.x`. La stessa stringa deve comparire in tre file:

- `package.json` → `version`
- `src-tauri/Cargo.toml` → `version`
- `src-tauri/tauri.conf.json` → `version`

Poi aggiorna [CHANGELOG.md](../CHANGELOG.md): sposta le voci da **Non pubblicato** a `## [x.y.z] - AAAA-MM-GG`.

## Tag e installer automatico

Il workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) parte su un tag `v*.*.*` (esempio `v0.1.0`).

Su un clone pulito, dopo il commit di changelog e numeri:

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

GitHub Actions (windows-latest):

1. Installa Node e Rust
2. Recupera le icone se mancano
3. Compila Tauri (`nsis`)
4. Apre una **Release in bozza** con l’installer allegato

Tu apri la bozza, controlli il testo (puoi copiare dal CHANGELOG), togli «draft» e pubblichi.

### Se la Action fallisce

- Versione nei tre file diversa dal tag
- Icone assenti e script di fetch bloccato
- `npm ci` / compile Rust: leggi il log del job

### Firma del codice

L’installer **non** è firmato. SmartScreen avviserà. Per una v1 «seria» serve un certificato Authenticode (e, se vorrai l’updater Tauri, anche le chiavi updater). Non committare mai la chiave privata: solo GitHub Secrets.

## Release notes (modello)

Titolo: `AInside 0.1.0`

```markdown
Prima anteprima pubblica per Windows.

## Installazione
Scarica l’`.exe` NSIS qui sotto, installa, apri l’app. I modelli si scaricano dopo, da Hugging Face.

## Novità
- (incolla dal CHANGELOG)

## Note
- SmartScreen può avvisare (binario non firmato).
- llama.cpp e i GGUF non sono dentro l’installer.
```

Asset attesi: `AInside_0.1.0_x64-setup.exe` (il nome esatto lo decide Tauri).

## Prima della v0.1.0

Checklist:

- [ ] Repo pubblica
- [ ] LICENSE, README, CHANGELOG, docs
- [ ] Icone brand in `src-tauri/icons` (altrimenti restano quelle Tauri di default)
- [ ] `cargo test` e un giro manuale: analisi PC, download piccolo, chat, API health
- [ ] Tag `v0.1.0` e pubblicazione della bozza

## Dopo una release

- In README i badge Release si aggiornano da soli
- Issue di regressione: etichetta `bug`, versione dell’installer nel corpo
- Non riciclare un tag; se hai sbagliato l’asset, fai `0.1.1`
