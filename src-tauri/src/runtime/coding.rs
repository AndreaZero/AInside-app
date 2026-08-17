use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::workspace::{
    build_pack, coding_system, leggi_paths, mentions_in, read_rel, strip_leggi_lines, with_pack,
};

use super::stream::{self, SampleConfig};
use super::types::ChatTurn;

const MAX_LEGGI: usize = 4;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingTurn {
    pub messages: Vec<ChatTurn>,
    pub workspace: String,
    #[serde(default)]
    pub cited: Vec<String>,
}

pub fn run(
    port: u16,
    request: &CodingTurn,
    stop: &AtomicBool,
    sample: &SampleConfig,
    context_tokens: u32,
    mut on_token: impl FnMut(&str),
) -> Result<(), String> {
    let mut cited = Vec::new();
    if let Some(last) = request.messages.iter().rev().find(|turn| turn.role == "user") {
        cited.extend(mentions_in(&last.content));
    }
    for rel in &request.cited {
        if !cited.iter().any(|old| old == rel) {
            cited.push(rel.clone());
        }
    }

    let budget = budget_chars(context_tokens);
    let pack = build_pack(&request.workspace, &cited, budget);
    let mut loaded = cited.clone();
    let turns = with_packed_last(&request.messages, &pack);
    if turns.iter().all(|turn| turn.role != "user" || turn.content.trim().is_empty()) {
        return Err("Scrivi qualcosa prima.".into());
    }

    let mut round = turns;
    let mut reads = 0usize;
    for _ in 0..=MAX_LEGGI {
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }
        let mut reply = String::new();
        stream::complete(port, &round, stop, sample, |token| {
            reply.push_str(token);
            on_token(token);
        })?;
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }
        let wanted: Vec<String> = leggi_paths(&stream::strip_think(&reply))
            .into_iter()
            .filter(|rel| !loaded.iter().any(|old| old == rel))
            .collect();
        if wanted.is_empty() || reads >= MAX_LEGGI {
            return Ok(());
        }
        let mut extra = String::from("Ecco i file:\n");
        let mut added = 0usize;
        for rel in wanted {
            if reads >= MAX_LEGGI {
                break;
            }
            reads += 1;
            added += 1;
            loaded.push(rel.clone());
            on_token(&format!("\n\nLeggo `{rel}`…\n"));
            match read_rel(&request.workspace, &rel) {
                Ok(file) => {
                    extra.push_str(&format!("### {}\n```\n{}\n```\n", file.rel, file.text));
                }
                Err(err) => {
                    extra.push_str(&format!("### {rel}\n({err})\n"));
                }
            }
        }
        if added == 0 {
            return Ok(());
        }
        let assistant = strip_leggi_lines(&stream::strip_think(&reply));
        round.push(ChatTurn {
            role: "assistant".into(),
            content: if assistant.is_empty() {
                "Mi servono altri file.".into()
            } else {
                assistant
            },
        });
        round.push(ChatTurn {
            role: "user".into(),
            content: extra,
        });
    }
    Ok(())
}

pub fn apply_coding_prompt(sample: &mut SampleConfig, model_name: Option<&str>) {
    sample.system_prompt = coding_system(model_name, sample.thinking);
    sample.max_tokens = sample.max_tokens.max(2048);
}

fn budget_chars(context_tokens: u32) -> usize {
    let tokens = context_tokens.max(1024) as usize;
    (tokens * 3 * 35) / 100
}

fn with_packed_last(messages: &[ChatTurn], pack: &str) -> Vec<ChatTurn> {
    let mut out = Vec::new();
    let last_user = messages
        .iter()
        .rposition(|turn| turn.role == "user" && !turn.content.trim().is_empty());
    for (index, turn) in messages.iter().enumerate() {
        if Some(index) == last_user {
            out.push(ChatTurn {
                role: "user".into(),
                content: with_pack(&turn.content, pack),
            });
        } else {
            out.push(turn.clone());
        }
    }
    out
}
