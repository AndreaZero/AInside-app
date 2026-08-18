# Privacy

AInside è un programma **locale**. Non c’è account, non c’è un backend AInside a cui arrivano le chat.

## Cosa resta sul computer

| Dato | Dove |
| --- | --- |
| Conversazioni | File dell’app (cartella dati Windows) |
| Impostazioni | Stesso ambito (profilo, esperto, API, cartelle libreria) |
| Modelli GGUF | Cartella di download che scegli tu, più eventuali librerie extra |
| Motore llama.cpp | Sottocartella runtime nei dati app |
| Analisi hardware | Calcolata sul dispositivo, usata per i consigli; non la inviamo a noi |

Nessun telemetria AInside è accesa in questa versione.

## Cosa esce in rete (e perché)

L’app parla con Internet solo per scaricare pezzi che non ospitiamo noi:

1. **Modelli** — URL pubblici Hugging Face (`resolve/…`) scritti nel catalogo.
2. **Motore** — zip ufficiali [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) (e, se serve, l’API GitHub `releases/latest` per trovare un build abbastanza nuovo).
3. **Icone di sviluppo** — solo se compilando da sorgente usi lo script delle icone Tauri.

Non mandiamo a questi servizi il testo delle chat. Il download è un GET del file.

L’**API locale** (`http://localhost:11435`) accetta connessioni **solo da questo PC** (`127.0.0.1`). Un altro computer in casa non ci arriva, a meno che tu non faccia da solo un tunnel: non è uno scenario supportato.

## Cosa non facciamo

- Non creiamo utenti
- Non firmiamo le copie da un server di controllo
- Non leggiamo le tue chat da remoto
- Non apriamo la porta 11435 su `0.0.0.0`

Se in `docs/` trovi bozze su un «piano admin», sono **schizzi non implementati**. Il prodotto pubblico è questo file, non quelle pagine.

## Modelli di terzi

I pesi che scarichi appartengono ai rispettivi autori e licenze. AInside è solo il client. Leggi la scheda del modello e il repository Hugging Face.

## Disinstallazione

Rimuovere l’app da Windows può lasciare i GGUF se stanno in una cartella tua. Cancellali tu se non li vuoi più sul disco.

## Segnalazioni

Una falla che espone dati: [SECURITY.md](../SECURITY.md), non una issue pubblica.
