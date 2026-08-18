# Roadmap

Stato onesto, senza date. Il dettaglio operativo è [tasks.md](tasks.md).

## C’è (anteprima 0.1)

- Analisi PC e punteggio prestazioni
- Catalogo curato + scelta automatica della variante
- Download, libreria, integrità
- Chat locale con streaming
- Config runtime automatica e tre profili
- Modalità esperto
- API OpenAI-compatible locale
- Modalità Codice: lettura, scrittura con permessi, terminale nella cartella

## Subito dopo (stesso filone Codice)

- Tasti **Installa** e **Avvia** se c’è un `package.json` (senza gergo npm in vista normale)
- Il modello può *proporre* un comando `ESEGUI:`; parte solo dopo conferma

## Dopo (non ora)

- Capire immagini in chat (mmproj), non generarle
- Ricerca web (es. DuckDuckGo), con permesso esplicito
- macOS e Linux come piattaforme di prima classe
- Altri backend oltre llama.cpp
- Catalogo aggiornabile da remoto
- Git in modalità Codice, con gli stessi permessi della scrittura
- Firma del codice / SmartScreen per l’installer Windows
- Aggiornamenti in-app (oggi si scarica la release da GitHub)

## Fuori scopo

Engine di inferenza proprietario. Catalogo Hugging Face grezzo come UI. Account utente. Autostart verso il cloud. Un IDE con tab e Language Server.
