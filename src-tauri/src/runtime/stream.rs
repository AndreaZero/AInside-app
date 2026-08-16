use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::{json, Value};

use crate::settings::ExpertSettings;

use super::types::ChatTurn;

fn default_system(model_name: Option<&str>, thinking: bool) -> String {
    let name = model_name
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("un modello locale");
    let think = if thinking {
        " Pensa poco, poi rispondi."
    } else {
        ""
    };
    format!("Sei {name}. Rispondi in modo chiaro e diretto, nella lingua di chi scrive.{think}")
}

const THINK_BUDGET: u32 = 192;
const THINK_LOOP_WINDOW: usize = 8;
const THINK_CHAR_CAP: usize = 900;

pub struct SampleConfig {
    pub temperature: f32,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
    pub min_p: Option<f32>,
    pub repeat_penalty: Option<f32>,
    pub seed: Option<i64>,
    pub system_prompt: String,
    pub thinking: bool,
}

impl SampleConfig {
    pub fn from_expert(expert: &ExpertSettings, thinking: bool, model_name: Option<&str>) -> Self {
        if !expert.enabled {
            return Self::standard(thinking, model_name);
        }
        Self {
            temperature: expert
                .temperature
                .unwrap_or(if thinking { 0.6 } else { 0.7 }),
            top_p: expert.top_p.or(if thinking { Some(0.95) } else { None }),
            top_k: expert.top_k.or(if thinking { Some(20) } else { None }),
            min_p: expert.min_p,
            repeat_penalty: expert
                .repeat_penalty
                .or(if thinking { Some(1.15) } else { None }),
            seed: expert.seed,
            system_prompt: expert
                .system_prompt
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(|text| text.to_string())
                .unwrap_or_else(|| default_system(model_name, thinking)),
            thinking,
        }
    }

    fn standard(thinking: bool, model_name: Option<&str>) -> Self {
        Self {
            temperature: if thinking { 0.6 } else { 0.7 },
            top_p: if thinking { Some(0.95) } else { None },
            top_k: if thinking { Some(20) } else { None },
            min_p: None,
            repeat_penalty: if thinking { Some(1.15) } else { None },
            seed: None,
            system_prompt: default_system(model_name, thinking),
            thinking,
        }
    }
}

pub fn complete(
    port: u16,
    turns: &[ChatTurn],
    stop: &AtomicBool,
    sample: &SampleConfig,
    mut on_token: impl FnMut(&str),
) -> Result<(), String> {
    let mut messages = vec![json!({"role": "system", "content": sample.system_prompt})];
    for turn in turns {
        let role = match turn.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        let content = strip_think(&turn.content);
        if content.trim().is_empty() {
            continue;
        }
        messages.push(json!({"role": role, "content": content}));
    }
    if messages.len() < 2 {
        return Err("Scrivi qualcosa prima.".into());
    }

    let mut body = json!({
        "model": "AInside",
        "stream": true,
        "temperature": sample.temperature,
        "max_tokens": if sample.thinking { 2048 } else { 1024 },
        "messages": messages,
    });
    apply_thinking(&mut body, sample.thinking);
    if let Some(value) = sample.top_p {
        body["top_p"] = json!(value);
    }
    if let Some(value) = sample.top_k {
        body["top_k"] = json!(value);
    }
    if let Some(value) = sample.min_p {
        body["min_p"] = json!(value);
    }
    if let Some(value) = sample.repeat_penalty {
        body["repeat_penalty"] = json!(value);
        if sample.thinking {
            body["penalty_last_n"] = json!(256);
            body["frequency_penalty"] = json!(0.35);
        }
    }
    if let Some(value) = sample.seed {
        body["seed"] = json!(value);
    }

    let client = reqwest::blocking::Client::builder()
        .user_agent("AInside/0.1 (desktop; Windows)")
        .connect_timeout(Duration::from_secs(10))
        .timeout(None)
        .build()
        .map_err(|e| format!("Non apro la conversazione: {e}"))?;

    let mut response = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .body(body.to_string())
        .send()
        .map_err(|e| format!("Il modello non risponde: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(format!("Risposta rifiutata ({status}): {text}"));
    }

    let mut reader = BufReader::new(&mut response);
    let mut line = String::new();
    let mut opened_think = false;
    let mut closed_think = false;
    let mut ignore_think = false;
    let mut got_content = false;
    let mut ignored_after_stop = 0usize;
    let mut think_buf = String::new();
    while reader
        .read_line(&mut line)
        .map_err(|e| format!("La risposta si è interrotta: {e}"))?
        > 0
    {
        if stop.load(Ordering::Relaxed) {
            if opened_think && !closed_think {
                on_token("\n</think>\n");
            }
            return Ok(());
        }
        if let Some(error) = take_error(&line) {
            return Err(error);
        }
        for delta in take_deltas(&line) {
            match delta {
                StreamDelta::Thinking(text) => {
                    if !sample.thinking {
                        continue;
                    }
                    if ignore_think {
                        ignored_after_stop += text.chars().count();
                        if !got_content && ignored_after_stop >= 400 {
                            if let Some(guess) = guess_answer_from_think(&think_buf) {
                                on_token(&guess);
                            }
                            return Ok(());
                        }
                        continue;
                    }
                    if !opened_think {
                        on_token("<think>\n");
                        opened_think = true;
                    }
                    think_buf.push_str(&text);
                    on_token(&text);
                    if thinking_should_stop(&think_buf) {
                        on_token("\n</think>\n");
                        closed_think = true;
                        ignore_think = true;
                    }
                }
                StreamDelta::Content(text) => {
                    if opened_think && !closed_think {
                        on_token("\n</think>\n");
                        closed_think = true;
                        ignore_think = true;
                    }
                    got_content = true;
                    on_token(&text);
                }
            }
        }
        line.clear();
    }
    if opened_think && !closed_think {
        on_token("\n</think>\n");
    }
    if !got_content {
        if let Some(guess) = guess_answer_from_think(&think_buf) {
            on_token(&guess);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamDelta {
    Content(String),
    Thinking(String),
}

pub fn apply_thinking(body: &mut Value, thinking: bool) {
    if body.get("chat_template_kwargs").is_none() {
        body["chat_template_kwargs"] = json!({ "enable_thinking": thinking });
    }
    if thinking {
        if body.get("reasoning_budget").is_none() {
            body["reasoning_budget"] = json!(THINK_BUDGET);
        }
    } else {
        if body.get("reasoning_effort").is_none() {
            body["reasoning_effort"] = json!("none");
        }
        if body.get("reasoning_budget").is_none() {
            body["reasoning_budget"] = json!(0);
        }
    }
}

pub fn thinking_should_stop(buf: &str) -> bool {
    buf.chars().count() >= THINK_CHAR_CAP
        || thinking_is_looping(buf)
        || thinking_repeats_prompt(buf)
        || thinking_is_meta(buf)
}

pub fn thinking_is_looping(buf: &str) -> bool {
    let words: Vec<&str> = buf.split_whitespace().collect();
    if words.len() < THINK_LOOP_WINDOW * 3 {
        return false;
    }
    let mut seen = std::collections::HashMap::<String, u32>::new();
    for i in 0..=words.len() - THINK_LOOP_WINDOW {
        let key = words[i..i + THINK_LOOP_WINDOW].join(" ").to_ascii_lowercase();
        if key.len() < 28 {
            continue;
        }
        let count = seen.entry(key).or_insert(0);
        *count += 1;
        if *count >= 3 {
            return true;
        }
    }
    false
}

fn thinking_repeats_prompt(buf: &str) -> bool {
    let lower = buf.to_ascii_lowercase();
    ["se ti chiedono chi sei", "ainside è", "ainside e'", "non sei tu"]
        .iter()
        .any(|marker| lower.matches(marker).count() >= 2)
}

fn thinking_is_meta(buf: &str) -> bool {
    let lower = buf.to_ascii_lowercase();
    [
        "thinking process",
        "analyze the request",
        "determine the persona",
        "drafting the response",
        "re-evaluating based",
        "output generation",
        "check constraints",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

pub fn guess_answer_from_think(buf: &str) -> Option<String> {
    let mut best: Option<String> = None;
    let bytes = buf.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            if let Some(end) = buf[i + 1..].find('"') {
                let candidate = buf[i + 1..i + 1 + end].trim();
                if looks_like_reply(candidate)
                    && best.as_ref().is_none_or(|cur| candidate.len() >= cur.len())
                {
                    best = Some(candidate.to_string());
                }
                i += end + 2;
                continue;
            }
        }
        i += 1;
    }
    if best.is_some() {
        return best;
    }
    buf.lines()
        .map(str::trim)
        .filter(|line| looks_like_reply(line) && starts_like_answer(line))
        .last()
        .map(str::to_string)
}

fn starts_like_answer(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("ciao")
        || lower.starts_with("buona")
        || lower.starts_with("salve")
        || lower.starts_with("sono ")
}

fn looks_like_reply(text: &str) -> bool {
    let chars = text.chars().count();
    if chars < 8 || chars > 240 {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    if lower.starts_with("wait")
        || lower.starts_with("okay")
        || lower.starts_with("i'll")
        || lower.starts_with("i will")
        || lower.contains("friendly way")
    {
        return false;
    }
    true
}

pub fn strip_think(content: &str) -> String {
    let mut out = String::new();
    let lower = content.to_ascii_lowercase();
    let mut idx = 0;
    while let Some(rel) = lower[idx..].find("<think>") {
        let start = idx + rel;
        out.push_str(&content[idx..start]);
        let after = start + 7;
        if let Some(end_rel) = lower[after..].find("</think>") {
            idx = after + end_rel + 8;
            if content[idx..].starts_with('\n') {
                idx += 1;
            }
        } else {
            return out.trim().to_string();
        }
    }
    out.push_str(&content[idx..]);
    out.trim().to_string()
}

pub fn take_deltas(line: &str) -> Vec<StreamDelta> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(':') {
        return Vec::new();
    }
    let Some(data) = trimmed.strip_prefix("data:") else {
        return Vec::new();
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return Vec::new();
    }
    let Ok(value) = serde_json::from_str::<Value>(data) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(text) = as_text(value.pointer("/choices/0/delta/reasoning_content"))
        .or_else(|| as_text(value.pointer("/choices/0/delta/reasoning")))
        .or_else(|| as_text(value.pointer("/choices/0/message/reasoning_content")))
    {
        out.push(StreamDelta::Thinking(text));
    }
    if let Some(text) = as_text(value.pointer("/choices/0/delta/content"))
        .or_else(|| as_text(value.pointer("/choices/0/message/content")))
        .or_else(|| as_text(value.pointer("/choices/0/text")))
    {
        out.push(StreamDelta::Content(text));
    }
    out
}

fn as_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Array(parts) => {
            let text: String = parts
                .iter()
                .filter_map(|part| {
                    part.as_str()
                        .map(str::to_string)
                        .or_else(|| as_text(part.get("text")))
                })
                .collect();
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn take_error(line: &str) -> Option<String> {
    let data = line.trim().strip_prefix("data:")?.trim();
    let value: Value = serde_json::from_str(data).ok()?;
    value
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_openai_delta() {
        let line = r#"data: {"choices":[{"delta":{"content":"Ciao"}}]}"#;
        assert_eq!(
            take_deltas(line),
            vec![StreamDelta::Content("Ciao".into())]
        );
    }

    #[test]
    fn ignores_done() {
        assert!(take_deltas("data: [DONE]").is_empty());
        assert!(take_deltas("data:[DONE]").is_empty());
    }

    #[test]
    fn reads_reasoning_separate_from_content() {
        let line = r#"data: {"choices":[{"delta":{"reasoning_content":"ok"}}]}"#;
        assert_eq!(
            take_deltas(line),
            vec![StreamDelta::Thinking("ok".into())]
        );
    }

    #[test]
    fn strip_think_keeps_answer() {
        assert_eq!(
            strip_think("<think>\nmmm\n</think>\nCiao"),
            "Ciao"
        );
        assert_eq!(strip_think("solo testo"), "solo testo");
    }

    #[test]
    fn detects_repeated_thinking() {
        let block = "Wait, I'll write it in a friendly way. Ciao! Sono AInside. Che cosa ti serve oggi? Che cosa ti serve? ";
        let once = block.repeat(1);
        let looped = block.repeat(4);
        assert!(!thinking_is_looping(&once));
        assert!(thinking_is_looping(&looped));
    }

    #[test]
    fn system_uses_model_name_not_app() {
        let prompt = default_system(Some("Qwen 3.5"), false);
        assert!(prompt.contains("Qwen 3.5"));
        assert!(prompt.starts_with("Sei Qwen 3.5."));
        assert!(!prompt.contains("AInside"));
        assert!(!default_system(Some("Gemma 4"), true).contains("AInside"));
    }

    fn stops_meta_thinking() {
        assert!(thinking_should_stop(
            "Thinking Process:\n1. Analyze the Request:\n"
        ));
        assert!(thinking_should_stop(&"x".repeat(THINK_CHAR_CAP)));
        assert!(!thinking_should_stop("L’utente saluta. Rispondo in italiano."));
    }

    fn picks_greeting_line_from_think() {
        let buf = "The user said good evening.\nBuonasera, come stai?\n";
        assert_eq!(
            guess_answer_from_think(buf).as_deref(),
            Some("Buonasera, come stai?")
        );
    }

    #[test]
    fn picks_quoted_reply_from_think() {
        let buf = r#"Wait, I'll write it in a friendly way.
"Ciao! Sono AInside. Che cosa ti serve oggi?"
"Che cosa ti serve?"
"#;
        assert_eq!(
            guess_answer_from_think(buf).as_deref(),
            Some("Ciao! Sono AInside. Che cosa ti serve oggi?")
        );
    }
}
