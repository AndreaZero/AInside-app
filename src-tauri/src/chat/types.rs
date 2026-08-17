use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionKind {
    #[default]
    Chat,
    Code,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patches: Option<Vec<ChatPatch>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPatch {
    pub rel: String,
    pub status: String,
    #[serde(default)]
    pub added: u32,
    #[serde(default)]
    pub removed: u32,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub created: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub variant_id: Option<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub kind: SessionKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStore {
    pub current_id: Option<String>,
    #[serde(default)]
    pub sessions: Vec<ChatSession>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSnapshot {
    pub current_id: Option<String>,
    pub sessions: Vec<ChatSession>,
}

impl ChatStore {
    pub fn snapshot(self) -> ChatSnapshot {
        ChatSnapshot {
            current_id: self.current_id,
            sessions: self.sessions,
        }
    }
}

pub fn title_from(text: &str) -> String {
    let compact: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let count = compact.chars().count();
    if compact.is_empty() {
        "Nuova chat".into()
    } else if count <= 42 {
        compact
    } else {
        format!("{}…", compact.chars().take(41).collect::<String>())
    }
}

pub fn folder_title(path: &str) -> String {
    Path::new(path.trim())
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_keeps_short_lines() {
        assert_eq!(title_from("  ciao   mondo  "), "ciao mondo");
    }

    #[test]
    fn title_cuts_long_lines() {
        let title = title_from(&"parola ".repeat(20));
        assert!(title.chars().count() <= 42);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn old_json_is_a_chat() {
        let raw = r#"{
            "id": "c1",
            "title": "ciao",
            "updatedAt": "1",
            "modelId": null,
            "modelName": null,
            "variantId": null,
            "messages": []
        }"#;
        let session: ChatSession = serde_json::from_str(raw).expect("session");
        assert_eq!(session.kind, SessionKind::Chat);
        assert!(session.workspace_path.is_none());
    }

    #[test]
    fn folder_title_uses_last_segment() {
        assert_eq!(folder_title(r"C:\Users\andre\progetto"), "progetto");
        assert_eq!(folder_title("/home/andre/app"), "app");
    }
}
