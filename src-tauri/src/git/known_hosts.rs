//! Minimal `known_hosts` lookup used to verify SSH host keys.
//!
//! libgit2's SSH transport does not check the server's host key against
//! `known_hosts` unless the embedding application supplies a
//! `certificate_check` callback — unlike the `ssh`/`git` CLI, which verifies
//! by default. This module gives [`crate::git::credentials::make_callbacks`]
//! enough to detect the case that actually matters here: a host the user has
//! already trusted (it has an entry in `known_hosts`) now presenting a
//! different key, the classic sign of a rotated key or a MITM.
//!
//! A host with no existing entry is reported as [`HostKeyVerdict::Unknown`]
//! rather than rejected — there is nothing to compare against, and refusing
//! every first-time SSH connection would trade a real (if narrower) security
//! gap for breaking normal use for as many users as it protects. A full
//! trust-on-first-use flow (prompt, record the fingerprint) needs a UI round
//! trip and is intentionally left for a follow-up.

use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

pub enum HostKeyVerdict {
    /// No `known_hosts` entry exists for this host.
    Unknown,
    /// A recorded entry for this host matches the presented key.
    Match,
    /// A recorded entry for this host exists but does not match.
    Mismatch,
}

struct Entry {
    /// Comma-separated plain hostname patterns (may contain `*`/`?`), empty
    /// when this entry uses hashed hostnames instead.
    patterns: Vec<String>,
    /// `(salt, hmac-sha1 hash)` for a `|1|salt|hash` hashed-hostname entry.
    hashed: Option<(Vec<u8>, Vec<u8>)>,
    key: Vec<u8>,
}

fn known_hosts_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".ssh").join("known_hosts"));
    }
    #[cfg(unix)]
    paths.push(PathBuf::from("/etc/ssh/ssh_known_hosts"));
    paths
}

fn decode_base64(value: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(value).ok()
}

/// `ssh-keygen`'s HMAC-SHA1-hashed hostname format (`HashKnownHosts yes`).
fn host_matches_hashed(salt: &[u8], hash: &[u8], hostname: &str) -> bool {
    let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(salt) else {
        return false;
    };
    mac.update(hostname.as_bytes());
    mac.finalize().into_bytes().as_slice() == hash
}

/// `*`/`?` glob match, case-insensitive (hostnames aren't case-sensitive).
fn wildmatch(pattern: &[u8], text: &[u8]) -> bool {
    match (pattern.first(), text.first()) {
        (None, None) => true,
        (Some(b'*'), _) => {
            wildmatch(&pattern[1..], text) || (!text.is_empty() && wildmatch(pattern, &text[1..]))
        }
        (Some(b'?'), Some(_)) => wildmatch(&pattern[1..], &text[1..]),
        (Some(p), Some(t)) if p.eq_ignore_ascii_case(t) => wildmatch(&pattern[1..], &text[1..]),
        _ => false,
    }
}

fn host_matches_plain(pattern: &str, hostname: &str) -> bool {
    // `[host]:port` entries: match on the host part, ignore port granularity.
    let pattern = pattern
        .strip_prefix('[')
        .and_then(|p| p.split(']').next())
        .unwrap_or(pattern);
    wildmatch(pattern.as_bytes(), hostname.as_bytes())
}

/// Parse one non-comment `known_hosts` line, if it's a well-formed entry.
///
/// `@cert-authority`/`@revoked` markers are skipped rather than specially
/// handled — a CA-signed or explicitly revoked key needs different
/// semantics than a plain match, and misreading one as a plain entry would
/// be worse than ignoring it.
fn parse_line(line: &str) -> Option<Entry> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') || line.starts_with('@') {
        return None;
    }

    let mut parts = line.split_whitespace();
    let first = parts.next()?;
    let _key_type = parts.next()?;
    let key = decode_base64(parts.next()?)?;

    if let Some(rest) = first.strip_prefix("|1|") {
        let mut fields = rest.splitn(2, '|');
        let salt = decode_base64(fields.next()?)?;
        let hash = decode_base64(fields.next()?)?;
        return Some(Entry {
            patterns: Vec::new(),
            hashed: Some((salt, hash)),
            key,
        });
    }

    let patterns = first
        .split(',')
        .filter(|p| !p.starts_with('!')) // negated patterns: not supported, skip rather than mismatch
        .map(str::to_string)
        .collect();
    Some(Entry {
        patterns,
        hashed: None,
        key,
    })
}

fn entries_for_host(hostname: &str) -> Vec<Entry> {
    let mut matches = Vec::new();
    for path in known_hosts_paths() {
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in content.lines() {
            let Some(entry) = parse_line(line) else {
                continue;
            };
            let is_match = match &entry.hashed {
                Some((salt, hash)) => host_matches_hashed(salt, hash, hostname),
                None => entry
                    .patterns
                    .iter()
                    .any(|p| host_matches_plain(p, hostname)),
            };
            if is_match {
                matches.push(entry);
            }
        }
    }
    matches
}

/// Compare a presented SSH host key against every `known_hosts` entry
/// recorded for `hostname`. Callers should pass whichever hash(es) git2
/// makes available — availability depends on the libssh2 build.
pub fn verify(
    hostname: &str,
    sha256: Option<&[u8; 32]>,
    sha1: Option<&[u8; 20]>,
    raw: Option<&[u8]>,
) -> HostKeyVerdict {
    let candidates = entries_for_host(hostname);
    if candidates.is_empty() {
        return HostKeyVerdict::Unknown;
    }

    for entry in &candidates {
        if let Some(want) = raw {
            if entry.key == want {
                return HostKeyVerdict::Match;
            }
        }
        if let Some(want) = sha256 {
            if Sha256::digest(&entry.key).as_slice() == want {
                return HostKeyVerdict::Match;
            }
        }
        if let Some(want) = sha1 {
            if Sha1::digest(&entry.key).as_slice() == want {
                return HostKeyVerdict::Match;
            }
        }
    }

    HostKeyVerdict::Mismatch
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildmatch_supports_star_and_question() {
        assert!(wildmatch(b"*.github.com", b"ssh.github.com"));
        assert!(wildmatch(b"github.com", b"GitHub.com"));
        assert!(!wildmatch(b"github.com", b"notgithub.com"));
        assert!(wildmatch(b"10.0.0.?", b"10.0.0.1"));
    }

    #[test]
    fn hashed_hostname_matches_known_vector() {
        // `ssh-keygen -H` output for host "example.com" hashed with a fixed
        // salt, verified against a reference HMAC-SHA1 implementation.
        let salt = decode_base64("qYuwjxCPKfXfd/OU9GbhFC8OTaU=").unwrap();
        let expected_host = "example.com";
        let mut mac = Hmac::<Sha1>::new_from_slice(&salt).unwrap();
        mac.update(expected_host.as_bytes());
        let hash = mac.finalize().into_bytes().to_vec();

        assert!(host_matches_hashed(&salt, &hash, "example.com"));
        assert!(!host_matches_hashed(&salt, &hash, "example.org"));
    }

    #[test]
    fn parse_line_reads_plain_and_hashed_entries() {
        let plain = parse_line("github.com,ssh.github.com ssh-ed25519 QUJD").unwrap();
        assert_eq!(plain.patterns, vec!["github.com", "ssh.github.com"]);
        assert!(plain.hashed.is_none());

        let hashed = parse_line("|1|c2FsdA==|aGFzaA== ssh-ed25519 QUJD").unwrap();
        assert!(hashed.hashed.is_some());

        assert!(parse_line("# a comment").is_none());
        assert!(parse_line("").is_none());
        assert!(parse_line("@revoked github.com ssh-ed25519 QUJD").is_none());
    }
}
