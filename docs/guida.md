# Guida a AInside

AInside esegue modelli di linguaggio **sul tuo PC**. Non serve un account. Le chat non passano da un nostro server.

## Requisiti

- Windows 10 o 11 (64 bit)
- Qualche gigabyte liberi sul disco (i modelli occupano da ~2 GB in su)
- Connessione internet **solo** per scaricare l’app, il motore llama.cpp e i modelli. Poi puoi chattare anche offline, se il file è già in libreria.

Una scheda grafica aiuta, ma non è obbligatoria: senza GPU l’app usa la CPU e ti consiglia modelli più piccoli.

## Installazione

1. Scarica l’installer dalla [pagina Release](https://github.com/AndreaZero/AInside-app/releases).
2. Avvia il file `.exe` e segui la procedura (installazione per l’utente corrente).
3. Apri **AInside**.

Se SmartScreen blocca il file, è normale su software non ancora firmato con certificato a pagamento. Controlla che l’URL sia questo repository, poi *Altre informazioni* → *Esegui comunque*.

## Primo avvio

L’app legge CPU, RAM, GPU e spazio disco. Vedi un riepilogo semplice e un punteggio **Prestazioni AI**. I numeri tecnici stanno dietro **Mostra dettagli**.

Poi apri **Modelli**. La lista **Per questo PC** è calcolata sul *tuo* hardware, non su un computer di riferimento.

Ogni scheda parla in termini di uso: qualità, italiano, codice, ragionamento, velocità prevista, spazio. Quantizzazione e nome file stanno in **Avanzate**.

Quando scarichi, AInside sceglie da sola la variante. Il motivo è del tipo:

> Abbiamo scelto questa versione perché offre il miglior equilibrio tra qualità e velocità sul tuo computer.

Puoi cambiarla comunque.

## Chat

Nella barra a sinistra: **Nuova chat**, cronologia, **Codice**, **Modelli**, **Download**, **Impostazioni**.

In chat vedi il modello attivo e lo stato locale. Scrivi, la risposta arriva a pezzi (streaming). Puoi fermare, rigenerare, copiare.

Le conversazioni restano sul disco, nella cartella dati dell’app.

## Download e libreria

I file GGUF arrivano da Hugging Face. AInside **non** li tiene sui propri server.

- Cartella predefinita: dati applicazione, sottocartella `models`
- Puoi cambiare dove salvare e aggiungere cartelle già piene di modelli
- Puoi annullare un download in corso; i file incompleti non vengono usati come pronti
- All’arrivo viene verificata l’integrità (SHA-256, quando il catalogo lo conosce)

In **Download** segui il progresso. In libreria: usa, togli, vedi se un file è incompleto o non valido.

## Profili prestazioni

In Impostazioni:

| Profilo | Effetto |
| --- | --- |
| **Risparmio** | Meno RAM/GPU, PC più reattivo |
| **Bilanciato** | Predefinito, equilibrio qualità/velocità |
| **Massime prestazioni** | Usa più risorse per andare più forte |

L’app stima la memoria prima di caricare il modello e, se serve, riduce context, batch o offload per evitare di esaurire la RAM.

## Modalità esperto

Spenta, l’interfaccia resta semplice. Accesa, in Impostazioni → Avanzate puoi toccare temperature, top_p, context, thread, batch, GPU offload, flash attention, cache, seed, system prompt. Un campo vuoto = lo decide l’app.

## Modalità Codice

Non è un ambiente di sviluppo completo. Apri una **cartella** del PC, parli col modello già acceso, lui può leggere i file e — se glielo permetti — modificarli. C’è un **terminale** nella stessa cartella, con conferma prima dei comandi.

Permessi di scrittura: chiedi ogni volta, per sessione, per cartella, o sempre. File tipo `.env` e chiavi: chiedono **sempre**.

Niente accesso a Internet da questa modalità, in questa versione. «Cerca» = nel progetto aperto.

## API per altri programmi

In Impostazioni puoi accendere un server su `http://localhost:11435`. Serve Cursor, VS Code, script. Guida: [api.md](api.md).

## Se qualcosa non va

1. Leggi il messaggio in italiano: di solito dice già cosa chiudere o cosa scaricare.
2. Apri **Diagnostica** (dalla barra o dal banner del motore) per il dettaglio tecnico.
3. Controlla spazio disco e che il modello risulti **Pronto** in libreria.
4. Se il motore non parte, serve rete almeno la prima volta: AInside scarica llama.cpp dalle release ufficiali.
5. Apri una [issue](https://github.com/AndreaZero/AInside-app/issues) con Windows, GPU/RAM e, se puoi, lo stralcio di Diagnostica. Togli chiavi e percorsi personali.

## Disinstallare

Dal pannello App di Windows, come qualsiasi programma. I modelli nella cartella che hai scelto **non** sempre vengono cancellati: sono file tuoi, possono occupare molti GB. Eliminali a mano se non ti servono più.
