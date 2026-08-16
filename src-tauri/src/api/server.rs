//! HTTP locale: elenco modelli e proxy OpenAI verso llama-server.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::library::{self, LibraryStatus};
use crate::runtime::RuntimeManager;
use crate::settings::{self, ExpertSettings};

pub const BIND: &str = "127.0.0.1:11435";
pub const PUBLIC_URL: &str = "http://localhost:11435";

const MAX_BODY: u64 = 8 * 1024 * 1024;

pub fn serve(server: Server, stop: &AtomicBool, app: &AppHandle) {
    while !stop.load(Ordering::Relaxed) {
        match server.recv_timeout(Duration::from_millis(400)) {
            Ok(Some(request)) => handle(request, app),
            Ok(None) => continue,
            Err(_) => break,
        }
    }
}

fn handle(request: Request, app: &AppHandle) {
    let path = normalize_path(request.url());
    let method = request.method().clone();
    if method == Method::Options {
        let _ = request.respond(cors(Response::empty(204)));
        return;
    }

    match (method, path.as_str()) {
        (Method::Get, "/health") | (Method::Get, "/") => respond_json(request, 200, &health_body(app)),
        (Method::Get, "/v1/models") => match models_body(app) {
            Ok(body) => respond_json(request, 200, &body),
            Err(message) => respond_error(request, 500, "server_error", &message),
        },
        (Method::Post, "/v1/chat/completions") => chat_completions(request, app),
        _ => respond_error(request, 404, "invalid_request_error", "Percorso non trovato."),
    }
}

fn health_body(app: &AppHandle) -> Value {
    let runtime = app.state::<RuntimeManager>();
    let model = runtime.ready_model_id();
    json!({
        "status": "ok",
        "ready": model.is_some(),
        "model": model,
    })
}

fn models_body(app: &AppHandle) -> Result<Value, String> {
    let snapshot = library::list_library(app.clone())?;
    let loaded = app.state::<RuntimeManager>().ready_model_id();
    let mut data = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut items: Vec<_> = snapshot
        .items
        .into_iter()
        .filter(|item| item.status == LibraryStatus::Pronto)
        .collect();
    items.sort_by(|a, b| {
        let a_hot = loaded.as_deref() == Some(a.model_id.as_str());
        let b_hot = loaded.as_deref() == Some(b.model_id.as_str());
        b_hot.cmp(&a_hot).then(a.model_name.cmp(&b.model_name))
    });
    for item in items {
        if !seen.insert(item.model_id.clone()) {
            continue;
        }
        data.push(json!({
            "id": item.model_id,
            "object": "model",
            "created": 0,
            "owned_by": "ainside",
        }));
    }
    Ok(json!({ "object": "list", "data": data }))
}

fn chat_completions(mut request: Request, app: &AppHandle) {
    let runtime = app.state::<RuntimeManager>();
    let Some(port) = runtime.ready_port() else {
        respond_error(
            request,
            503,
            "unavailable_error",
            "Accendi il modello in AInside prima di usare l’API.",
        );
        return;
    };

    let raw = match read_body(&mut request) {
        Ok(bytes) => bytes,
        Err(message) => {
            respond_error(request, 400, "invalid_request_error", &message);
            return;
        }
    };
    let incoming: Value = match serde_json::from_slice(&raw) {
        Ok(value) => value,
        Err(_) => {
            respond_error(request, 400, "invalid_request_error", "JSON non valido.");
            return;
        }
    };
    if !messages_ok(&incoming) {
        respond_error(
            request,
            400,
            "invalid_request_error",
            "Manca l’elenco messages.",
        );
        return;
    }

    let expert = settings::expert(app).unwrap_or_default();
    let thinking = settings::thinking_enabled(app);
    let body = prepare_upstream_body(incoming, &expert, thinking);
    let stream = body.get("stream").and_then(Value::as_bool).unwrap_or(false);

    let client = match reqwest::blocking::Client::builder()
        .user_agent("AInside-API/0.1")
        .connect_timeout(Duration::from_secs(10))
        .timeout(None)
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            respond_error(
                request,
                502,
                "server_error",
                &format!("Non apro la conversazione: {error}"),
            );
            return;
        }
    };

    let accept = if stream {
        "text/event-stream"
    } else {
        "application/json"
    };
    let upstream = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .header("Accept", accept)
        .body(body.to_string())
        .send();

    match upstream {
        Ok(response) if stream => proxy_stream(request, response),
        Ok(response) => proxy_json(request, response),
        Err(error) => respond_error(
            request,
            502,
            "server_error",
            &format!("Il modello non risponde: {error}"),
        ),
    }
}

fn proxy_json(request: Request, upstream: reqwest::blocking::Response) {
    let status = upstream.status().as_u16();
    let text = upstream.text().unwrap_or_default();
    let response = Response::from_string(text)
        .with_status_code(StatusCode(status))
        .with_header(json_header());
    let _ = request.respond(cors(response));
}

fn proxy_stream(request: Request, upstream: reqwest::blocking::Response) {
    let status = upstream.status().as_u16();
    if !upstream.status().is_success() {
        proxy_json(request, upstream);
        return;
    }
    let mut headers = cors_headers();
    headers.push(header("Content-Type", "text/event-stream"));
    headers.push(header("Cache-Control", "no-cache"));
    let response = Response::new(StatusCode(status), headers, upstream, None, None);
    let _ = request.respond(response);
}

fn read_body(request: &mut Request) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    request
        .as_reader()
        .take(MAX_BODY + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Non leggo la richiesta: {e}"))?;
    if buf.len() as u64 > MAX_BODY {
        return Err("Richiesta troppo grande.".into());
    }
    Ok(buf)
}

pub(crate) fn prepare_upstream_body(
    mut body: Value,
    expert: &ExpertSettings,
    thinking: bool,
) -> Value {
    crate::runtime::apply_thinking(&mut body, thinking);

    if body.get("max_tokens").is_none() {
        if let Some(tokens) = body.get("max_completion_tokens").cloned() {
            body["max_tokens"] = tokens;
        } else {
            body["max_tokens"] = json!(if thinking { 4096 } else { 1024 });
        }
    }

    if body.get("temperature").is_none() {
        let temperature = if expert.enabled {
            expert.temperature.unwrap_or(0.7)
        } else {
            0.7
        };
        body["temperature"] = json!(temperature);
    }

    if expert.enabled {
        fill_if_absent(&mut body, "top_p", expert.top_p);
        fill_if_absent(&mut body, "top_k", expert.top_k);
        fill_if_absent(&mut body, "min_p", expert.min_p);
        fill_if_absent(&mut body, "repeat_penalty", expert.repeat_penalty);
        fill_if_absent(&mut body, "seed", expert.seed);
    }

    body
}

fn fill_if_absent<T: serde::Serialize>(body: &mut Value, key: &str, value: Option<T>) {
    if body.get(key).is_none() {
        if let Some(value) = value {
            body[key] = json!(value);
        }
    }
}

pub(crate) fn messages_ok(body: &Value) -> bool {
    body.get("messages")
        .and_then(Value::as_array)
        .is_some_and(|messages| !messages.is_empty())
}

pub(crate) fn normalize_path(url: &str) -> String {
    let path = url.split('?').next().unwrap_or("/");
    if path.len() > 1 {
        path.trim_end_matches('/').to_string()
    } else {
        path.to_string()
    }
}

fn respond_json(request: Request, status: u16, body: &Value) {
    let response = Response::from_string(body.to_string())
        .with_status_code(StatusCode(status))
        .with_header(json_header());
    let _ = request.respond(cors(response));
}

fn respond_error(request: Request, status: u16, kind: &str, message: &str) {
    respond_json(request, status, &error_payload(kind, message));
}

pub(crate) fn error_payload(kind: &str, message: &str) -> Value {
    json!({
        "error": {
            "message": message,
            "type": kind,
            "param": null,
            "code": null
        }
    })
}

fn json_header() -> Header {
    header("Content-Type", "application/json; charset=utf-8")
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("header")
}

fn cors_headers() -> Vec<Header> {
    vec![
        header("Access-Control-Allow-Origin", "*"),
        header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        header("Access-Control-Allow-Headers", "Authorization, Content-Type"),
    ]
}

fn cors<R: Read>(mut response: Response<R>) -> Response<R> {
    for item in cors_headers() {
        response = response.with_header(item);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_query_and_slash() {
        assert_eq!(normalize_path("/v1/models?foo=1"), "/v1/models");
        assert_eq!(normalize_path("/v1/models/"), "/v1/models");
        assert_eq!(normalize_path("/"), "/");
    }

    #[test]
    fn rejects_empty_messages() {
        assert!(!messages_ok(&json!({})));
        assert!(!messages_ok(&json!({ "messages": [] })));
        assert!(messages_ok(&json!({
            "messages": [{ "role": "user", "content": "ciao" }]
        })));
    }

    #[test]
    fn disables_thinking_and_fills_defaults() {
        let body = prepare_upstream_body(
            json!({
                "messages": [{ "role": "user", "content": "ciao" }],
                "stream": true
            }),
            &ExpertSettings::default(),
            false,
        );
        assert_eq!(body["reasoning_effort"], "none");
        assert_eq!(body["chat_template_kwargs"]["enable_thinking"], false);
        assert_eq!(body["max_tokens"], 1024);
        assert_eq!(body["temperature"], 0.7);
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn keeps_client_sampling() {
        let body = prepare_upstream_body(
            json!({
                "messages": [{ "role": "user", "content": "ciao" }],
                "temperature": 0.2,
                "max_completion_tokens": 64
            }),
            &ExpertSettings::default(),
            false,
        );
        assert_eq!(body["temperature"], 0.2);
        assert_eq!(body["max_tokens"], 64);
    }

    #[test]
    fn openai_error_shape() {
        let payload = error_payload("unavailable_error", "Accendi il modello");
        assert_eq!(payload["error"]["type"], "unavailable_error");
        assert_eq!(payload["error"]["message"], "Accendi il modello");
    }
}
