# Sicurezza

Se trovi una vulnerabilità in AInside (esecuzione codice indesiderata, fuga di chat, path traversal fuori dalla cartella aperta, bind dell’API fuori da localhost, ecc.), **non** aprire una issue pubblica.

## Come segnalare

Usa [GitHub Private vulnerability reporting](https://github.com/AndreaZero/AInside-app/security/advisories/new) sul repository.

Includi:

- versione dell’app o commit
- Windows (build)
- passi per riprodurre
- effetto (cosa succede, cosa dovrebbe succedere)
- se il problema tocca i modelli o solo l’app

Rispondiamo quando possiamo; l’anteprima 0.x è mantenuta in tempo libero.

## Ambito

- Codice di questa repo (UI, Rust, installer)
- Il server locale `127.0.0.1:11435`

Fuori ambito, da segnalare a monte:

- bug di [llama.cpp](https://github.com/ggml-org/llama.cpp)
- pesi e licenze dei modelli su Hugging Face
- il fatto che un modello produca testo sbagliato o tossico

## Note di progetto

- L’API è volutamente solo su localhost e spenta di default
- La modalità Codice rifiuta path fuori dalla root; i file segreto restano in «chiedi sempre»
- Non committare chiavi di firma Windows o updater
