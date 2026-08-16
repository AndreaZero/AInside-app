//! SHA-256 incrementale con checkpoint su disco, per riprendere senza rileggere il .part.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::compress256;
use sha2::digest::generic_array::GenericArray;

const IV: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
];

#[derive(Clone, Serialize, Deserialize)]
struct HashCheckpoint {
    v: u32,
    bytes: u64,
    expected: String,
    state: [u32; 8],
    tail: String,
}

#[derive(Clone)]
pub struct StreamingSha256 {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    total_len: u64,
}

impl StreamingSha256 {
    pub fn new() -> Self {
        Self {
            state: IV,
            buffer: [0; 64],
            buffer_len: 0,
            total_len: 0,
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        if data.is_empty() {
            return;
        }
        if self.buffer_len > 0 {
            let space = 64 - self.buffer_len;
            if data.len() < space {
                self.buffer[self.buffer_len..self.buffer_len + data.len()].copy_from_slice(data);
                self.buffer_len += data.len();
                self.total_len += data.len() as u64;
                return;
            }
            let mut block = [0u8; 64];
            block[..self.buffer_len].copy_from_slice(&self.buffer[..self.buffer_len]);
            block[self.buffer_len..].copy_from_slice(&data[..space]);
            compress_one(&mut self.state, &block);
            self.buffer_len = 0;
            self.total_len += space as u64;
            data = &data[space..];
        }
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            compress_one(&mut self.state, &block);
            self.total_len += 64;
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buffer[..data.len()].copy_from_slice(data);
            self.buffer_len = data.len();
            self.total_len += data.len() as u64;
        }
    }

    pub fn finalize(self) -> String {
        let mut state = self.state;
        let mut block = [0u8; 64];
        block[..self.buffer_len].copy_from_slice(&self.buffer[..self.buffer_len]);
        block[self.buffer_len] = 0x80;
        let bit_len = self.total_len.saturating_mul(8);
        if self.buffer_len > 55 {
            compress_one(&mut state, &block);
            block = [0u8; 64];
        }
        block[56..64].copy_from_slice(&bit_len.to_be_bytes());
        compress_one(&mut state, &block);
        let mut out = [0u8; 32];
        for (i, word) in state.iter().enumerate() {
            out[i * 4..(i + 1) * 4].copy_from_slice(&word.to_be_bytes());
        }
        hex::encode(out)
    }

    fn to_checkpoint(&self, expected: &str) -> HashCheckpoint {
        HashCheckpoint {
            v: 1,
            bytes: self.total_len,
            expected: expected.to_ascii_lowercase(),
            state: self.state,
            tail: hex::encode(&self.buffer[..self.buffer_len]),
        }
    }

    fn from_checkpoint(cp: &HashCheckpoint, expected: &str, part_len: u64) -> Option<Self> {
        if cp.v != 1 || cp.bytes != part_len {
            return None;
        }
        if !cp.expected.eq_ignore_ascii_case(expected) {
            return None;
        }
        let tail = hex::decode(cp.tail.trim()).ok()?;
        if tail.len() > 63 || tail.len() as u64 != cp.bytes % 64 {
            return None;
        }
        let mut buffer = [0u8; 64];
        buffer[..tail.len()].copy_from_slice(&tail);
        Some(Self {
            state: cp.state,
            buffer,
            buffer_len: tail.len(),
            total_len: cp.bytes,
        })
    }
}

fn compress_one(state: &mut [u32; 8], block: &[u8; 64]) {
    let ga = GenericArray::clone_from_slice(block);
    compress256(state, &[ga]);
}

pub fn save_checkpoint(
    path: &Path,
    hasher: &StreamingSha256,
    expected: &str,
) -> Result<(), String> {
    let json = serde_json::to_string(&hasher.to_checkpoint(expected))
        .map_err(|e| format!("Non salvo il controllo: {e}"))?;
    let tmp = path.with_file_name(format!(
        "{}.tmp",
        path.file_name()
            .map(|n| n.to_string_lossy())
            .unwrap_or_default()
    ));
    fs::write(&tmp, json).map_err(|e| format!("Non scrivo il controllo: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Non chiudo il controllo: {e}"))?;
    Ok(())
}

pub fn load_checkpoint(path: &Path, expected: &str, part_len: u64) -> Option<StreamingSha256> {
    let raw = fs::read_to_string(path).ok()?;
    let cp: HashCheckpoint = serde_json::from_str(&raw).ok()?;
    match StreamingSha256::from_checkpoint(&cp, expected, part_len) {
        Some(hasher) => Some(hasher),
        None => {
            let _ = fs::remove_file(path);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn matches_sha2(data: &[u8]) {
        let mut ours = StreamingSha256::new();
        ours.update(data);
        assert_eq!(ours.finalize(), hex::encode(Sha256::digest(data)));
    }

    #[test]
    fn padding_edges() {
        matches_sha2(b"");
        matches_sha2(b"abc");
        matches_sha2(&[0xABu8; 55]);
        matches_sha2(&[0xABu8; 56]);
        matches_sha2(&[0xABu8; 63]);
        matches_sha2(&[0xABu8; 64]);
        matches_sha2(&[0xABu8; 65]);
        matches_sha2(&[0xABu8; 300_000]);
    }

    #[test]
    fn chunked_matches_oneshot() {
        let data: Vec<u8> = (0..2000).map(|i| i as u8).collect();
        let mut ours = StreamingSha256::new();
        for chunk in data.chunks(17) {
            ours.update(chunk);
        }
        assert_eq!(ours.finalize(), hex::encode(Sha256::digest(&data)));
    }

    #[test]
    fn checkpoint_resume() {
        let expected = "a".repeat(64);
        let mut first = StreamingSha256::new();
        first.update(b"hello ");
        let restored =
            StreamingSha256::from_checkpoint(&first.to_checkpoint(&expected), &expected, 6)
                .unwrap();
        let mut rest = restored;
        rest.update(b"world");
        assert_eq!(rest.finalize(), hex::encode(Sha256::digest(b"hello world")));
    }

    #[test]
    fn checkpoint_rejects_size_mismatch() {
        let expected = "a".repeat(64);
        let mut first = StreamingSha256::new();
        first.update(b"hello");
        assert!(
            StreamingSha256::from_checkpoint(&first.to_checkpoint(&expected), &expected, 4)
                .is_none()
        );
    }
}
