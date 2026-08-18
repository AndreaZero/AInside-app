# Come contribuire

Grazie se vuoi migliorare AInside. Lingua delle issue, PR e UI: **italiano**.

## Prima di scrivere codice

1. Apri una issue (bug o idea) se il cambiamento non è banale.
2. Leggi [docs/prompt.md](docs/prompt.md): l’utente non deve scegliere quantizzazione o layer GPU in vista normale.
3. Il lavoro implementativo segue [docs/tasks.md](docs/tasks.md), **un task alla volta**, nell’ordine.
4. [AGENTS.md](AGENTS.md) vale per chi sviluppa con un agente AI in questo repo.

## Ambiente

Istruzioni: [docs/sviluppo.md](docs/sviluppo.md). Compili e testi **tu** (`npm install`, `npm run tauri dev`, `cargo test`).

## Cosa teniamo

- Messaggi utente in italiano semplice
- Errori: frase chiara + dettaglio tecnico pieghevole
- Catalogo: file Hugging Face verificati (size, SHA-256, `updatedAt`)
- Privacy: niente account, API solo localhost, chat sul disco

## Cosa evitiamo

- Clonare l’UI di LM Studio
- Esporre GGUF/Q4/CUDA nella schermata normale
- Hosti di pesi modelli
- Segreti, GGUF, `node_modules` o `target/` nel commit
- Anticipare task futuri «perché tanto servono»

## Pull request

- Un tema per PR, titolo esplicito in italiano o inglese
- Descrivi il *perché*, non solo il diff
- UI: dove si vede, in quale vista
- Non bumpare la versione a caso: lo fa chi taglia la [release](docs/rilascio.md)

Usa il modello in `.github/PULL_REQUEST_TEMPLATE.md`.

## Segnalare un buco di sicurezza

[SECURITY.md](SECURITY.md), non una issue aperta.

## Licenza

Contribuendo accetti che il codice entri sotto [MIT](LICENSE).
