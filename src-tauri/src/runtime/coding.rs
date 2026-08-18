use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::workspace::{
    build_pack, clip_utf8, coding_system, fit_file_block, leggi_paths, mentions_in, read_rel,
    strip_leggi_lines, with_pack,
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

    let budget = prompt_char_budget(context_tokens, sample.max_tokens);
    let last_len = request
        .messages
        .iter()
        .rev()
        .find(|turn| turn.role == "user")
        .map(|turn| turn.content.len())
        .unwrap_or(0);
    let pack_room = budget
        .saturating_sub(sample.system_prompt.len())
        .saturating_sub(turns_chars(&request.messages).saturating_sub(last_len))
        .saturating_sub(last_len)
        .saturating_sub(16);
    let pack = build_pack(&request.workspace, &cited, pack_room);
    let mut loaded = cited.clone();
    let turns = with_packed_last(&request.messages, &pack);
    if turns
        .iter()
        .all(|turn| turn.role != "user" || turn.content.trim().is_empty())
    {
        return Err("Scrivi qualcosa prima.".into());
    }

    let mut round = turns;
    clip_turns(&mut round, &sample.system_prompt, budget);
    let leggi_max = max_leggi(context_tokens);
    let mut reads = 0usize;
    let mut nudged = false;
    for _ in 0..=leggi_max {
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }
        let mut reply = String::new();
        stream::complete(port, &round, stop, sample, |token| {
            reply.push_str(token);
            on_token(token);
            !halt_for_unread_leggi(&reply, &loaded)
        })?;
        if stop.load(std::sync::atomic::Ordering::Relaxed) {
            return Ok(());
        }
        let wanted: Vec<String> = leggi_paths(&stream::strip_think(&reply))
            .into_iter()
            .filter(|rel| !loaded.iter().any(|old| old == rel))
            .collect();
        if wanted.is_empty() {
            return Ok(());
        }
        if reads >= leggi_max {
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

        let room = budget
            .saturating_sub(sample.system_prompt.len())
            .saturating_sub(turns_chars(&round))
            .saturating_sub(24);
        let left = leggi_max.saturating_sub(reads);
        let (extra, added) = pack_reads(
            &request.workspace,
            &wanted,
            left,
            room,
            &mut on_token,
        );
        for rel in &added {
            loaded.push(rel.clone());
        }
        reads += added.len();

        if extra.is_empty() {
            if nudged {
                return Ok(());
            }
            nudged = true;
            round.push(ChatTurn {
                role: "user".into(),
                content: "Non è entrato altro in memoria. Rispondi con i file che hai già.".into(),
            });
        } else {
            round.push(ChatTurn {
                role: "user".into(),
                content: extra,
            });
        }
        clip_turns(&mut round, &sample.system_prompt, budget);
    }
    Ok(())
}

pub fn apply_coding_prompt(
    sample: &mut SampleConfig,
    model_name: Option<&str>,
    context_tokens: u32,
) {
    sample.system_prompt = coding_system(model_name, sample.thinking);
    let ctx = context_tokens.max(512);
    let reply = (ctx / 3).clamp(256, 1024);
    sample.max_tokens = sample.max_tokens.min(reply);
}

fn max_leggi(context_tokens: u32) -> usize {
    match context_tokens {
        n if n >= 4096 => MAX_LEGGI,
        n if n >= 2048 => 2,
        _ => 1,
    }
}

fn prompt_char_budget(context_tokens: u32, max_tokens: u32) -> usize {
    let ctx = context_tokens.max(512);
    let reserve = max_tokens.max(128).min(ctx.saturating_sub(256));
    let prompt = ctx.saturating_sub(reserve).saturating_sub(128).max(256);
    // Codice ~2.5 caratteri/token; meglio stare larghi che prendere un 400.
    (prompt as usize * 5) / 2
}

fn turns_chars(turns: &[ChatTurn]) -> usize {
    turns.iter().map(|turn| turn.content.len().saturating_add(8)).sum()
}

fn clip_turns(turns: &mut Vec<ChatTurn>, system: &str, cap: usize) {
    let cap = cap.max(64);
    let mut guard = 0usize;
    while system.len() + turns_chars(turns) > cap && guard < 32 {
        guard += 1;
        let used = system.len() + turns_chars(turns);
        let overflow = used - cap;
        let last = turns.len().saturating_sub(1);
        let idx = turns
            .iter()
            .enumerate()
            .filter(|(i, _)| *i != last || turns.len() == 1)
            .max_by_key(|(_, turn)| turn.content.len())
            .map(|(i, _)| i)
            .unwrap_or(last);
        let keep = turns[idx].content.len().saturating_sub(overflow + 8);
        if keep < 24 {
            if turns.len() > 1 && idx != last {
                turns.remove(idx);
                continue;
            }
            turns[idx].content = clip_keep_question(&turns[idx].content, 48);
            break;
        }
        turns[idx].content = if idx == last {
            clip_keep_question(&turns[idx].content, keep)
        } else {
            clip_utf8(&turns[idx].content, keep)
        };
    }
}

fn clip_keep_question(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    if let Some(at) = text.rfind("\n---\n") {
        let tail = &text[at..];
        if tail.len() <= max {
            let head = clip_utf8(&text[..at], max.saturating_sub(tail.len()));
            return format!("{head}{tail}");
        }
        return clip_utf8(tail, max);
    }
    clip_utf8(text, max)
}

fn pack_reads(
    root: &str,
    wanted: &[String],
    left: usize,
    room: usize,
    on_token: &mut impl FnMut(&str),
) -> (String, Vec<String>) {
    if left == 0 || room < 40 {
        return (String::new(), Vec::new());
    }
    let mut extra = String::from("Ecco i file:\n");
    let mut added = Vec::new();
    let mut skipped = 0usize;
    for rel in wanted.iter().take(left) {
        let used = extra.len();
        let slot = room.saturating_sub(used);
        if slot < 40 {
            skipped += 1;
            continue;
        }
        match read_rel(root, rel) {
            Ok(file) => {
                let (block, ok) = fit_file_block(&file.rel, &file.text, file.truncated, slot);
                if !ok {
                    skipped += 1;
                    continue;
                }
                on_token(&format!("\n\nLeggo `{rel}`…\n"));
                extra.push_str(&block);
                added.push(rel.clone());
            }
            Err(err) => {
                on_token(&format!("\n\nLeggo `{rel}`…\n"));
                let line = format!("### {rel}\n({err})\n");
                extra.push_str(&clip_utf8(&line, slot));
                added.push(rel.clone());
            }
        }
    }
    skipped += wanted.len().saturating_sub(left);
    if skipped > 0 && !added.is_empty() {
        extra.push_str(
            "Altri file non sono entrati. Chiedili dopo, uno alla volta, con LEGGI:\n",
        );
    }
    if extra == "Ecco i file:\n" {
        return (String::new(), added);
    }
    (extra, added)
}

fn halt_for_unread_leggi(reply: &str, loaded: &[String]) -> bool {
    let text = content_after_think(reply);
    let finished = if text.ends_with('\n') {
        text.as_str()
    } else {
        text.rsplit_once('\n').map(|(head, _)| head).unwrap_or("")
    };
    leggi_paths(finished)
        .into_iter()
        .any(|rel| !loaded.iter().any(|old| old == &rel))
}

fn content_after_think(reply: &str) -> String {
    let lower = reply.to_ascii_lowercase();
    if let Some(end) = lower.rfind("</think>") {
        let rest = &reply[end + 8..];
        return rest.strip_prefix('\n').unwrap_or(rest).to_string();
    }
    if lower.contains("<think>") {
        return String::new();
    }
    reply.to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_context_reads_one_file() {
        assert_eq!(max_leggi(1024), 1);
        assert_eq!(max_leggi(2048), 2);
        assert_eq!(max_leggi(4096), 4);
    }

    #[test]
    fn prompt_budget_leaves_room_for_the_reply() {
        let budget = prompt_char_budget(1024, 341);
        assert!(budget < 2000, "{budget}");
        assert!(budget > 400, "{budget}");
    }

    #[test]
    fn clip_turns_keeps_the_question() {
        let mut turns = vec![ChatTurn {
            role: "user".into(),
            content: format!("{}\n---\nanalisi codebase e recap", "x".repeat(4000)),
        }];
        clip_turns(&mut turns, "sys", 200);
        assert!(turns[0].content.contains("analisi codebase e recap"));
    }

    #[test]
    fn coding_reply_tokens_fit_context() {
        let mut sample = SampleConfig {
            temperature: 0.7,
            top_p: None,
            top_k: None,
            min_p: None,
            repeat_penalty: None,
            seed: None,
            system_prompt: String::new(),
            thinking: false,
            max_tokens: 2048,
        };
        apply_coding_prompt(&mut sample, Some("Qwen"), 1024);
        assert!(sample.max_tokens <= 1024 / 3);
        assert!(sample.max_tokens >= 256);
    }

    #[test]
    fn halts_after_a_complete_leggi_line() {
        assert!(halt_for_unread_leggi("LEGGI: src/index.css\n", &[]));
        assert!(!halt_for_unread_leggi("LEGGI: src/index.css", &[]));
        assert!(!halt_for_unread_leggi(
            "LEGGI: src/index.css\n",
            &["src/index.css".into()]
        ));
        assert!(!halt_for_unread_leggi("<think>\nLEGGI: src/a.ts\n", &[]));
    }
}
