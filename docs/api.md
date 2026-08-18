# API locale

AInside può esporre il modello **già acceso in Chat** su una porta del computer, nello stesso formato usato da OpenAI. Così Cursor, VS Code, Python o uno script parlano col modello locale.

- **Spenta di default.** La accendi in Impostazioni → API locale.
- Ascolta solo **`127.0.0.1:11435`**: altri dispositivi in rete non ci arrivano.
- Se la porta è occupata, chiudi l’altro programma (o un’altra copia di AInside) e riprova.
- Il modello deve essere **caricato** in AInside, altrimenti le richieste di chat rispondono 503.

Base URL: `http://localhost:11435`

Non serve una chiave. Se il client la pretende, usa ad esempio `ainside`.

## Endpoint

| Metodo | Percorso | Ruolo |
| --- | --- | --- |
| `GET` | `/` o `/health` | Stato: `status`, `ready`, `model` |
| `GET` | `/v1/models` | Modelli **pronti in libreria** (`id` = id catalogo) |
| `POST` | `/v1/chat/completions` | Chat, con o senza streaming |

Le risposte di errore seguono la forma OpenAI: `{ "error": { "message", "type" } }`. CORS è aperto per `GET` / `POST` / `OPTIONS` (uso da pagine locali).

## Chat

Corpo minimo: un elenco `messages` non vuoto.

```json
{
  "model": "qwen35-9b",
  "messages": [
    { "role": "user", "content": "Ciao, rispondi in italiano." }
  ],
  "stream": false
}
```

Note:

- `model` può essere omesso: viene usato il modello carico in AInside.
- Se manca `max_tokens` (o `max_completion_tokens`), il default è 1024, oppure 4096 se in Impostazioni è acceso il «pensiero» del modello.
- `temperature` di default 0,7. In modalità esperto, se non li mandi tu, partono anche top_p, top_k, min_p, repeat_penalty, seed.
- Streaming: `"stream": true` → `text/event-stream` (chunk `data:` come OpenAI).

## Esempi

### curl

```powershell
curl http://localhost:11435/v1/models
```

```powershell
curl http://localhost:11435/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Dimmi solo: ok\"}]}"
```

### Python

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11435/v1", api_key="ainside")

reply = client.chat.completions.create(
    model="qwen35-9b",
    messages=[{"role": "user", "content": "Riassumi AInside in una frase."}],
)
print(reply.choices[0].message.content)
```

### Cursor

1. In AInside: accendi l’API e carica un modello.
2. In Cursor: impostazioni modelli / OpenAI compatible.
3. Base URL: `http://localhost:11435/v1`
4. Chiave: `ainside` (qualunque stringa va bene).
5. Scegli l’id che vedi in `GET /v1/models`.

Il flusso analogo vale per estensioni VS Code che parlano con un endpoint OpenAI.

## Limiti di questa versione

- Solo chat completions, non embeddings, non image, non tools OpenAI.
- Corpo massimo circa 8 MB.
- È un proxy verso `llama-server` già avviato da AInside: spegnere il modello in app chiude anche l’API utile.
- Pensata per **lo stesso PC**, non per condividerla in LAN.
