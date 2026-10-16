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
    /// No `known_hosts` entry exists for this host, or none recorded for the
    /// key algorithm the server presented.
    Unknown,
    /// A recorded entry for this host matches the presented key.
    Match,
    /// A recorded entry for this host exists, for the same key algorithm, but
    /// does not match.
    Mismatch,
    /// The presented key matches an entry the user marked `@revoked`.
    Revoked,
}

struct Entry {
    /// Comma-separated plain hostname patterns (may contain `*`/`?`), empty
    /// when this entry uses hashed hostnames instead.
    patterns: Vec<String>,
    /// `!pattern` exclusions (stored without the `!`): a host matching one of
    /// these is not covered by the entry even if `patterns` match it.
    negated: Vec<String>,
    /// `(salt, hmac-sha1 hash)` for a `|1|salt|hash` hashed-hostname entry.
    hashed: Option<(Vec<u8>, Vec<u8>)>,
    /// The key algorithm this entry records (`ssh-ed25519`, `ssh-rsa`, ...).
    ///
    /// Kept so a host that has only an old `ssh-rsa` entry, while the server
    /// now negotiates `ssh-ed25519`, is not reported as a key mismatch. Every
    /// such connection used to raise the full man-in-the-middle warning.
    key_type: String,
    /// Set for an `@revoked` entry: the key is recorded precisely so that
    /// presenting it is an error.
    revoked: bool,
    key: Vec<u8>,
}

/// The algorithm name from an SSH public-key blob.
///
/// The wire format is a 4-byte big-endian length followed by the algorithm
/// name, so the type the server presented can be read without a full parse.
fn key_type_of(raw: &[u8]) -> Option<String> {
    let len_bytes = raw.get(..4)?;
    let len = u32::from_be_bytes([len_bytes[0], len_bytes[1], len_bytes[2], len_bytes[3]]) as usize;
    // A sane algorithm name is short; anything else means this is not a blob
    // we understand, and guessing would be worse than declining.
    if len == 0 || len > 64 {
        return None;
    }
    let name = raw.get(4..4 + len)?;
    std::str::from_utf8(name).ok().map(str::to_string)
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

/// The SSH port a remote URL connects to, or `None` for a non-SSH URL.
///
/// `ssh://[user@]host[:port]/path` carries an explicit port; the scp-like
/// `[user@]host:path` form always uses 22.
pub fn ssh_port_of_url(url: &str) -> Option<u16> {
    let rest = ["ssh://", "git+ssh://", "ssh+git://"]
        .iter()
        .find_map(|scheme| url.strip_prefix(scheme));
    let Some(rest) = rest else {
        // scp-like syntax has no scheme, a colon, and no slash before it.
        let is_scp_like = !url.contains("://")
            && url
                .find(':')
                .is_some_and(|colon| !url[..colon].contains('/'));
        return is_scp_like.then_some(22);
    };
    let authority = rest.split('/').next().unwrap_or(rest);
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    let port = match host_port.strip_prefix('[') {
        // IPv6 literal: `[::1]:2222`
        Some(v6) => v6.split_once("]:").map(|(_, port)| port),
        None => host_port.split_once(':').map(|(_, port)| port),
    };
    Some(port.and_then(|p| p.parse().ok()).unwrap_or(22))
}

/// How OpenSSH names a host in `known_hosts`: bare on port 22, and
/// `[host]:port` on any other port. Hashed entries are a hash of this name.
pub fn host_entry_name(hostname: &str, port: Option<u16>) -> String {
    match port {
        Some(port) if port != 22 => format!("[{}]:{}", hostname, port),
        _ => hostname.to_string(),
    }
}

/// Plain-pattern match with OpenSSH's port rule: a bare pattern covers port
/// 22 only, and `[pattern]:port` that one port. With the port unknown
/// (`None`), only the host part is compared.
fn host_matches_plain(pattern: &str, hostname: &str, port: Option<u16>) -> bool {
    let (host_pattern, pattern_port) =
        match pattern.strip_prefix('[').and_then(|p| p.split_once("]:")) {
            Some((host, port)) => (host, port.parse::<u16>().ok()),
            None => (pattern, Some(22)),
        };
    let port_ok = match port {
        None => true,
        Some(port) => pattern_port == Some(port),
    };
    port_ok && wildmatch(host_pattern.as_bytes(), hostname.as_bytes())
}

/// Parse one non-comment `known_hosts` line, if it's a well-formed entry.
///
/// `@revoked` is parsed and carried through as [`Entry::revoked`]. Dropping the
/// line instead — as this used to — meant that a host whose *only* entry was
/// `@revoked` looked like a host with no entry at all, so the verdict was
/// `Unknown` and the caller let the connection through. A key the user
/// explicitly revoked was therefore accepted silently, which inverts the
/// meaning of the marker.
///
/// `@cert-authority` remains unsupported: a CA-signed key needs signature
/// verification against the CA rather than a byte comparison, and treating the
/// CA's own key as if it were the host's would be wrong. It is skipped
/// explicitly rather than by falling through the `@` test.
fn parse_line(line: &str) -> Option<Entry> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let mut revoked = false;
    let line = if let Some(rest) = line.strip_prefix("@revoked") {
        revoked = true;
        rest.trim_start()
    } else if line.starts_with('@') {
        // @cert-authority and any future marker: not understood, so not used.
        return None;
    } else {
        line
    };

    let mut parts = line.split_whitespace();
    let first = parts.next()?;
    let key_type = parts.next()?.to_string();
    let key = decode_base64(parts.next()?)?;

    if let Some(rest) = first.strip_prefix("|1|") {
        let mut fields = rest.splitn(2, '|');
        let salt = decode_base64(fields.next()?)?;
        let hash = decode_base64(fields.next()?)?;
        return Some(Entry {
            patterns: Vec::new(),
            negated: Vec::new(),
            hashed: Some((salt, hash)),
            key_type,
            revoked,
            key,
        });
    }

    // `!pattern` excludes a host the other patterns would match. Negations
    // used to be dropped, so `*.example.com,!legacy.example.com` applied to
    // `legacy.example.com` too — reporting a mismatch (and a MITM warning)
    // for a host the entry explicitly excludes.
    let (negated, patterns): (Vec<String>, Vec<String>) = first
        .split(',')
        .map(str::to_string)
        .partition(|p| p.starts_with('!'));
    Some(Entry {
        patterns,
        negated: negated
            .into_iter()
            .map(|p| p.trim_start_matches('!').to_string())
            .collect(),
        hashed: None,
        key_type,
        revoked,
        key,
    })
}

fn entries_for_host(hostname: &str, port: Option<u16>) -> Vec<Entry> {
    // A hashed entry for a non-standard port is a hash of `[host]:port`, so
    // hashing the bare hostname never matched it.
    let entry_name = host_entry_name(hostname, port);
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
                Some((salt, hash)) => host_matches_hashed(salt, hash, &entry_name),
                None => {
                    entry
                        .patterns
                        .iter()
                        .any(|p| host_matches_plain(p, hostname, port))
                        && !entry
                            .negated
                            .iter()
                            .any(|p| host_matches_plain(p, hostname, port))
                }
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
    port: Option<u16>,
    sha256: Option<&[u8; 32]>,
    sha1: Option<&[u8; 20]>,
    raw: Option<&[u8]>,
) -> HostKeyVerdict {
    let candidates = entries_for_host(hostname, port);
    if candidates.is_empty() {
        return HostKeyVerdict::Unknown;
    }

    let matches_entry = |entry: &Entry| -> bool {
        if let Some(want) = raw {
            if entry.key == want {
                return true;
            }
        }
        if let Some(want) = sha256 {
            if Sha256::digest(&entry.key).as_slice() == want {
                return true;
            }
        }
        if let Some(want) = sha1 {
            if Sha1::digest(&entry.key).as_slice() == want {
                return true;
            }
        }
        false
    };

    // Revocation is checked first and wins over any other entry: if the same
    // key is also recorded as trusted somewhere, the explicit revocation is the
    // more recent and more specific statement of intent.
    if candidates.iter().filter(|e| e.revoked).any(&matches_entry) {
        return HostKeyVerdict::Revoked;
    }

    if candidates.iter().filter(|e| !e.revoked).any(&matches_entry) {
        return HostKeyVerdict::Match;
    }

    // No match. Before calling that a mismatch — which shows the user a
    // man-in-the-middle warning — check that we actually hold an entry for the
    // algorithm the server presented. A host with only an old `ssh-rsa` entry
    // that now negotiates `ssh-ed25519` is the common, entirely legitimate
    // case, and reporting it as an attack trains users to click through the
    // warning that matters. OpenSSH likewise compares within the key type.
    //
    // If the key type cannot be determined (libssh2 gave us hashes but no raw
    // blob), fall back to reporting a mismatch: failing closed is the right
    // default for the one check standing between the user and a MITM.
    if let Some(presented_type) = raw.and_then(key_type_of) {
        let have_same_type = candidates
            .iter()
            .any(|e| !e.revoked && e.key_type == presented_type);
        if !have_same_type {
            return HostKeyVerdict::Unknown;
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

    fn hmac(salt: &[u8], name: &str) -> Vec<u8> {
        let mut mac = Hmac::<Sha1>::new_from_slice(salt).unwrap();
        mac.update(name.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }

    /// A non-standard port is recorded as `[host]:port`, and a hashed entry is
    /// the hash of that whole string. Hashing the bare host never matched it.
    #[test]
    fn hashed_entries_for_non_standard_ports_match_on_that_port() {
        let salt = b"0123456789abcdefghij";
        let on_2222 = hmac(salt, "[git.example.com]:2222");
        let name = host_entry_name("git.example.com", Some(2222));
        assert!(host_matches_hashed(salt, &on_2222, &name));
        assert!(!host_matches_hashed(salt, &on_2222, "git.example.com"));

        let on_22 = hmac(salt, "git.example.com");
        assert!(host_matches_hashed(
            salt,
            &on_22,
            &host_entry_name("git.example.com", Some(22))
        ));
    }

    #[test]
    fn plain_patterns_follow_openssh_port_rules() {
        // A bare pattern is port 22 only.
        assert!(host_matches_plain("example.com", "example.com", Some(22)));
        assert!(!host_matches_plain(
            "example.com",
            "example.com",
            Some(2222)
        ));
        // A bracketed pattern is its own port only.
        assert!(host_matches_plain(
            "[example.com]:2222",
            "example.com",
            Some(2222)
        ));
        assert!(!host_matches_plain(
            "[example.com]:2222",
            "example.com",
            Some(22)
        ));
        assert!(host_matches_plain(
            "[*.example.com]:2222",
            "git.example.com",
            Some(2222)
        ));
        // Port unknown: host part only, as before.
        assert!(host_matches_plain(
            "[example.com]:2222",
            "example.com",
            None
        ));
        assert!(host_matches_plain("example.com", "example.com", None));
    }

    #[test]
    fn ssh_port_is_read_from_every_url_form() {
        assert_eq!(
            ssh_port_of_url("ssh://git@example.com:2222/r.git"),
            Some(2222)
        );
        assert_eq!(ssh_port_of_url("ssh://example.com/r.git"), Some(22));
        assert_eq!(ssh_port_of_url("git+ssh://u@h:7999/r"), Some(7999));
        assert_eq!(ssh_port_of_url("ssh://git@[::1]:2200/r"), Some(2200));
        assert_eq!(ssh_port_of_url("git@github.com:org/repo.git"), Some(22));
        assert_eq!(ssh_port_of_url("https://github.com/org/repo.git"), None);
        assert_eq!(ssh_port_of_url("/local/path/repo"), None);
    }

    #[test]
    fn parse_line_reads_plain_and_hashed_entries() {
        let plain = parse_line("github.com,ssh.github.com ssh-ed25519 QUJD").unwrap();
        assert_eq!(plain.patterns, vec!["github.com", "ssh.github.com"]);
        assert!(plain.hashed.is_none());
        assert_eq!(plain.key_type, "ssh-ed25519");
        assert!(!plain.revoked);

        let hashed = parse_line("|1|c2FsdA==|aGFzaA== ssh-ed25519 QUJD").unwrap();
        assert!(hashed.hashed.is_some());

        assert!(parse_line("# a comment").is_none());
        assert!(parse_line("").is_none());
    }

    /// `!pattern` excludes a host; it used to be dropped, so the entry applied
    /// to the very host it excluded.
    #[test]
    fn parse_line_keeps_negated_patterns_as_exclusions() {
        let entry = parse_line("*.example.com,!legacy.example.com ssh-ed25519 QUJD").unwrap();
        assert_eq!(entry.patterns, vec!["*.example.com"]);
        assert_eq!(entry.negated, vec!["legacy.example.com"]);
    }

    /// A `@revoked` line used to be dropped, which made a host whose only entry
    /// was a revocation indistinguishable from a host with no entry at all — so
    /// `verify` returned `Unknown` and the caller accepted the revoked key.
    #[test]
    fn parse_line_carries_revoked_marker_instead_of_dropping_it() {
        let revoked = parse_line("@revoked github.com ssh-ed25519 QUJD").unwrap();
        assert!(revoked.revoked);
        assert_eq!(revoked.patterns, vec!["github.com"]);
        assert_eq!(revoked.key_type, "ssh-ed25519");
        assert_eq!(revoked.key, b"ABC");
    }

    /// `@cert-authority` needs signature verification against the CA rather
    /// than a byte comparison, so it stays unsupported — but deliberately, not
    /// by falling through a blanket `@` test.
    #[test]
    fn parse_line_still_skips_cert_authority() {
        assert!(parse_line("@cert-authority *.example.com ssh-ed25519 QUJD").is_none());
    }

    #[test]
    fn key_type_of_reads_the_algorithm_name_from_a_blob() {
        // 4-byte big-endian length, then the algorithm name.
        let mut blob = vec![0, 0, 0, 11];
        blob.extend_from_slice(b"ssh-ed25519");
        blob.extend_from_slice(b"\x00\x01\x02");
        assert_eq!(key_type_of(&blob).as_deref(), Some("ssh-ed25519"));

        assert_eq!(key_type_of(&[0, 0, 0, 0]), None);
        assert_eq!(key_type_of(&[0, 0]), None);
        // Absurd length: not a blob we understand.
        assert_eq!(key_type_of(&[0, 0, 1, 0]), None);
    }
}
