//! Questions a network operation has to ask the user while it runs: HTTPS
//! credentials nothing else could supply, and whether to trust an SSH host
//! seen for the first time.
//!
//! libgit2 asks for these from inside its callbacks, on the operation's own
//! thread. The question goes to the UI as a `git:prompt` event; the thread
//! then waits until [`answer`] delivers the reply (via the
//! `answer_git_prompt` command) or [`PROMPT_TIMEOUT`] passes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

/// The event name the frontend listens for.
pub const PROMPT_EVENT: &str = "git:prompt";

/// How long an operation waits for an answer before giving up.
pub const PROMPT_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PromptRequest {
    /// Username and password (or token) for an HTTPS remote.
    #[serde(rename_all = "camelCase")]
    Credentials {
        id: String,
        url: String,
        username: Option<String>,
        /// The previous answer was rejected by the server.
        retry: bool,
    },
    /// An SSH host with no `known_hosts` entry.
    #[serde(rename_all = "camelCase")]
    HostKey {
        id: String,
        host: String,
        key_type: String,
        /// OpenSSH-style `SHA256:…` fingerprint.
        fingerprint: String,
    },
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAnswer {
    pub username: Option<String>,
    pub password: Option<String>,
    /// For a host key: trust it.
    pub accept: Option<bool>,
}

/// Sends a prompt to the UI.
pub type Prompter = Arc<dyn Fn(PromptRequest) + Send + Sync>;

static PENDING: LazyLock<parking_lot::Mutex<HashMap<String, mpsc::Sender<Option<PromptAnswer>>>>> =
    LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

/// Ask the user and wait for the answer. `None` means declined, dismissed or
/// timed out.
pub fn ask(
    prompter: &Prompter,
    build: impl FnOnce(String) -> PromptRequest,
) -> Option<PromptAnswer> {
    ask_with_timeout(prompter, build, PROMPT_TIMEOUT)
}

pub fn ask_with_timeout(
    prompter: &Prompter,
    build: impl FnOnce(String) -> PromptRequest,
    timeout: Duration,
) -> Option<PromptAnswer> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    PENDING.lock().insert(id.clone(), tx);

    prompter(build(id.clone()));
    let answer = rx.recv_timeout(timeout).ok().flatten();

    PENDING.lock().remove(&id);
    answer
}

/// Deliver the user's answer to the waiting operation. Returns whether a
/// question with that id was still waiting.
pub fn answer(id: &str, reply: Option<PromptAnswer>) -> bool {
    match PENDING.lock().remove(id) {
        Some(tx) => tx.send(reply).is_ok(),
        None => false,
    }
}

/// OpenSSH's fingerprint format: `SHA256:` and unpadded base64.
pub fn fingerprint(sha256: &[u8; 32]) -> String {
    use base64::Engine;
    format!(
        "SHA256:{}",
        base64::engine::general_purpose::STANDARD_NO_PAD.encode(sha256)
    )
}

/// Record a host key the user chose to trust in `~/.ssh/known_hosts`, as
/// `ssh` itself does on first connection.
/// `host` is the `known_hosts` name: bare, or `[host]:port` off port 22 (see
/// [`crate::git::known_hosts::host_entry_name`]).
pub fn remember_host_key(host: &str, key_type: &str, raw_key: &[u8]) -> std::io::Result<()> {
    use base64::Engine;
    use std::io::Write;

    let home = dirs::home_dir()
        .ok_or_else(|| std::io::Error::other("Could not determine the home directory"))?;
    let ssh_dir = home.join(".ssh");
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&ssh_dir)?;

    let path = ssh_dir.join("known_hosts");
    // Start on a fresh line even if the file does not end with one.
    let needs_newline = std::fs::read(&path)
        .map(|bytes| !bytes.is_empty() && !bytes.ends_with(b"\n"))
        .unwrap_or(false);

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    if needs_newline {
        writeln!(file)?;
    }
    writeln!(
        file,
        "{} {} {}",
        host,
        key_type,
        base64::engine::general_purpose::STANDARD.encode(raw_key)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_answer_reaches_the_waiting_operation() {
        let prompter: Prompter = Arc::new(|request| {
            let PromptRequest::Credentials { id, .. } = request else {
                panic!("expected a credentials prompt");
            };
            // The UI answers from another thread, as the IPC command does.
            std::thread::spawn(move || {
                answer(
                    &id,
                    Some(PromptAnswer {
                        username: Some("me".into()),
                        password: Some("secret".into()),
                        accept: None,
                    }),
                );
            });
        });

        let reply = ask(&prompter, |id| PromptRequest::Credentials {
            id,
            url: "https://example.com/r.git".into(),
            username: None,
            retry: false,
        })
        .expect("an answer");
        assert_eq!(reply.username.as_deref(), Some("me"));
        assert_eq!(reply.password.as_deref(), Some("secret"));
    }

    #[test]
    fn an_unanswered_prompt_times_out_as_declined() {
        let prompter: Prompter = Arc::new(|_| {});
        let reply = ask_with_timeout(
            &prompter,
            |id| PromptRequest::HostKey {
                id,
                host: "example.com".into(),
                key_type: "ssh-ed25519".into(),
                fingerprint: "SHA256:x".into(),
            },
            Duration::from_millis(20),
        );
        assert!(reply.is_none());
    }

    #[test]
    fn answering_an_unknown_prompt_is_a_no_op() {
        assert!(!answer("no-such-prompt", None));
    }

    #[test]
    fn fingerprints_use_the_openssh_format() {
        let fp = fingerprint(&[0u8; 32]);
        assert!(fp.starts_with("SHA256:"));
        assert!(!fp.ends_with('='), "OpenSSH omits base64 padding");
    }
}
