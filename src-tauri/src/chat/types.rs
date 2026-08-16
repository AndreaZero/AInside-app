use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
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
}
