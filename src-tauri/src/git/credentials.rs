use git2::{Cred, CredentialType, RemoteCallbacks};
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Collects per-ref rejection messages reported by the server during a push.
///
/// `Remote::push` succeeds as long as the *transport* succeeded, even when the
/// server refuses individual ref updates (non-fast-forward, protected branch,
/// pre-receive hook). The only way to observe those refusals is the
/// `push_update_reference` callback, so we record them here and inspect the
/// report once the push returns.
pub type PushRejections = Rc<RefCell<Vec<String>>>;

pub fn new_push_rejections() -> PushRejections {
    Rc::new(RefCell::new(Vec::new()))
}

/// Turn collected rejections into a single error, if the server refused anything.
pub fn check_push_rejections(rejections: &PushRejections) -> Result<(), crate::error::AppError> {
    let rejected = rejections.borrow();
    if rejected.is_empty() {
        return Ok(());
    }
    Err(crate::error::AppError::git(format!(
        "The remote rejected the push:\n{}",
        rejected.join("\n")
    )))
}

/// Build remote callbacks for a push, recording any server-side ref rejections
/// into `rejections`. Callers MUST run [`check_push_rejections`] afterwards.
pub fn make_push_callbacks<'a>(
    custom_ssh_path: Option<String>,
    rejections: PushRejections,
    progress: Option<SharedProgress>,
    remote_url: Option<&str>,
) -> RemoteCallbacks<'a> {
    let mut callbacks = make_callbacks_with_progress(custom_ssh_path, progress, remote_url);
    callbacks.push_update_reference(move |refname, status| {
        if let Some(msg) = status {
            rejections
                .borrow_mut()
                .push(format!("{} — {}", refname, msg));
        }
        // Returning Ok lets libgit2 report the remaining refs too; the caller
        // converts the collected messages into a single actionable error.
        Ok(())
    });
    callbacks
}

/// Candidate SSH keys, in the order they should be tried.
fn ssh_key_candidates(custom_ssh_path: &Option<String>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path_str) = custom_ssh_path {
        let path = PathBuf::from(path_str);
        if path.exists() {
            candidates.push(path);
        }
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    for name in ["id_basilico", "id_ed25519", "id_ecdsa", "id_rsa"] {
        let p = home.join(".ssh").join(name);
        if p.exists() && !candidates.contains(&p) {
            candidates.push(p);
        }
    }

    candidates
}

/// True when the key file is passphrase-protected.
///
/// An encrypted key needs a passphrase that Basilico cannot prompt for from
/// inside this callback, so such keys are skipped in favour of the agent —
/// which is exactly where an unlocked copy of that key would live.
#[doc(hidden)]
pub fn key_is_encrypted_for_test(path: &Path) -> bool {
    key_is_encrypted(path)
}

fn key_is_encrypted(path: &Path) -> bool {
    let Ok(contents) = std::fs::read_to_string(path) else {
        // Unreadable or binary: let libgit2 decide.
        return false;
    };

    // Traditional PEM marks encryption in its headers; OpenSSH's own format
    // names the cipher on the second line, with "none" meaning unencrypted.
    if contents.contains("Proc-Type: 4,ENCRYPTED") || contents.contains("DEK-Info:") {
        return true;
    }

    if contents.contains("BEGIN OPENSSH PRIVATE KEY") {
        // The base64 body starts with a header naming the cipher; an unencrypted
        // key encodes "none" there, which base64-encodes into the "bm9uZQ" run.
        let body: String = contents
            .lines()
            .filter(|l| !l.starts_with("-----"))
            .collect();
        return !body.contains("bm9uZQ");
    }

    false
}

/// Credentials from the user's git credential helper, if it has any for `url`.
fn helper_credential(url: &str, username_from_url: Option<&str>) -> Option<Cred> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(config) = git2::Config::open_default() {
            if let Some((username, password)) =
                get_credentials_via_custom_helper(&config, url, username_from_url)
            {
                return Cred::userpass_plaintext(&username, &password).ok();
            }
        }
    }

    let config = git2::Config::open_default().ok()?;
    Cred::credential_helper(&config, url, username_from_url).ok()
}

/// The GitHub token from Settings, when `url` is an HTTPS URL on github.com.
///
/// The token was stored but never used for git itself, so an HTTPS clone or
/// push of a private GitHub repository failed without a credential helper.
/// It is offered to github.com only — never to another host.
pub fn github_token_for(url: &str) -> Option<String> {
    if !is_github_https_url(url) {
        return None;
    }
    crate::secrets::github_pat().ok().flatten()
}

/// True for `https://github.com/...`, with or without `user@`.
pub fn is_github_https_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split('/').next().unwrap_or("");
    let host = authority.rsplit('@').next().unwrap_or("");
    host.eq_ignore_ascii_case("github.com")
}

/// Build remote callbacks with credential handling.
/// Supports SSH agent, SSH key files, and username/password.
pub fn make_callbacks<'a>(custom_ssh_path: Option<String>) -> RemoteCallbacks<'a> {
    make_callbacks_with_progress(custom_ssh_path, None, None)
}

/// A progress reporter shared by the several callbacks of one operation.
pub type SharedProgress = Rc<RefCell<crate::git::progress::ProgressReporter>>;

/// [`make_callbacks`], reporting transfer progress to `progress` and stopping
/// the operation once it is cancelled.
///
/// `remote_url` supplies the SSH port for host-key checks: libgit2 hands the
/// certificate callback only the hostname, and `known_hosts` records a host on
/// a non-standard port as `[host]:port`.
pub fn make_callbacks_with_progress<'a>(
    custom_ssh_path: Option<String>,
    progress: Option<SharedProgress>,
    remote_url: Option<&str>,
) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    let ssh_port = remote_url.and_then(crate::git::known_hosts::ssh_port_of_url);

    // libgit2 re-invokes this callback until it succeeds or we return an error.
    // Handing back the same rejected credential forever would spin, so each
    // attempt moves on to the next candidate.
    let mut attempt: usize = 0;
    // How many times a username/password was requested. libgit2 asks again
    // after every rejection, up to its own replay limit, and the credential
    // helper hands back the same stored credential each time — so a stale
    // token was sent to the server over and over before the operation failed
    // with an unhelpful "too many redirects or authentication replays".
    let mut userpass_attempts: usize = 0;
    let mut tried_helper = false;
    let mut tried_github_token = false;
    // When the operation has a UI behind it, the user can be asked for what
    // nothing else supplied. At most twice: once, and once more if the server
    // rejects the first answer.
    let prompter = progress.as_ref().and_then(|p| p.borrow().prompter());
    let credential_prompter = prompter.clone();
    let mut credential_prompts: usize = 0;

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        // An `ssh://host/path` URL with no user in it: libgit2 first asks for
        // just a username before offering key types. This was unhandled, so
        // such remotes failed with "no credentials available".
        if allowed_types.contains(CredentialType::USERNAME)
            && !allowed_types.contains(CredentialType::SSH_KEY)
        {
            return Cred::username(username_from_url.unwrap_or("git"));
        }

        if allowed_types.contains(CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            let candidates = ssh_key_candidates(&custom_ssh_path);

            // Try each usable key once, then the agent, then give up.
            while attempt < candidates.len() {
                let path = candidates[attempt].clone();
                attempt += 1;

                if key_is_encrypted(&path) {
                    log::debug!(
                        "Skipping passphrase-protected SSH key {}; \
                         add it to your ssh-agent with `ssh-add` to use it.",
                        path.display()
                    );
                    continue;
                }

                return Cred::ssh_key(username, None, &path, None);
            }

            if attempt == candidates.len() {
                attempt += 1;
                return Cred::ssh_key_from_agent(username);
            }

            return Err(git2::Error::from_str(
                "No usable SSH key was accepted. If your key has a passphrase, \
                 load it into your ssh-agent with `ssh-add`, or select a key in Settings.",
            ));
        }

        if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            userpass_attempts += 1;

            // Each source of HTTPS credentials is offered once, in order: the
            // user's own git credential helper, then — for github.com — the
            // token stored in Settings. A credential the server rejected is
            // never offered again.
            if !tried_helper {
                tried_helper = true;
                if let Some(cred) = helper_credential(_url, username_from_url) {
                    return Ok(cred);
                }
            }
            if !tried_github_token {
                tried_github_token = true;
                if let Some(token) = github_token_for(_url) {
                    return Cred::userpass_plaintext("x-access-token", &token);
                }
            }

            if let Some(prompter) = &credential_prompter {
                if credential_prompts < 2 {
                    credential_prompts += 1;
                    let reply = crate::git::prompts::ask(prompter, |id| {
                        crate::git::prompts::PromptRequest::Credentials {
                            id,
                            url: _url.to_string(),
                            username: username_from_url.map(str::to_string),
                            retry: userpass_attempts > 1,
                        }
                    });
                    return match reply {
                        Some(crate::git::prompts::PromptAnswer {
                            username: Some(username),
                            password: Some(password),
                            ..
                        }) if !username.is_empty() => {
                            Cred::userpass_plaintext(&username, &password)
                        }
                        _ => Err(git2::Error::from_str(
                            "Authentication was cancelled: no credentials were entered.",
                        )),
                    };
                }
            }

            if userpass_attempts > 1 {
                return Err(git2::Error::from_str(
                    "Authentication failed: the remote rejected the credentials Basilico \
                     had for it (from your git credential helper, or the GitHub token in \
                     Settings). Update them — for example by signing in again with your \
                     Git credential manager or `gh auth login` — and retry.",
                ));
            }
        }

        if allowed_types.contains(CredentialType::DEFAULT) {
            return Cred::default();
        }

        Err(git2::Error::from_str(
            "No credentials are available for this remote. For HTTPS, configure a git \
             credential helper (such as Git Credential Manager, or `gh auth setup-git`); \
             for SSH, add your key to ssh-agent or choose a key in Settings.",
        ))
    });

    let host_prompter = prompter;
    callbacks.certificate_check(move |cert, hostname| {
        let Some(hostkey) = cert.as_hostkey() else {
            // Not an SSH host-key certificate (e.g. HTTPS/X.509) — nothing
            // for this callback to check.
            return Ok(git2::CertificateCheckStatus::CertificatePassthrough);
        };

        match crate::git::known_hosts::verify(
            hostname,
            ssh_port,
            hostkey.hash_sha256(),
            hostkey.hash_sha1(),
            hostkey.hostkey(),
        ) {
            crate::git::known_hosts::HostKeyVerdict::Match => {
                Ok(git2::CertificateCheckStatus::CertificateOk)
            }
            // No known_hosts entry to compare against: nothing this callback
            // can verify one way or the other, so defer rather than block a
            // host the user has simply never connected to from this machine.
            // A host never connected to from this machine. With a UI, do what
            // `ssh` does on first connection: show the fingerprint, and on
            // the user's say-so trust the key and record it in known_hosts.
            // Without one, defer to libgit2 as before.
            crate::git::known_hosts::HostKeyVerdict::Unknown => {
                let (Some(prompter), Some(sha256)) = (&host_prompter, hostkey.hash_sha256()) else {
                    return Ok(git2::CertificateCheckStatus::CertificatePassthrough);
                };
                let key_type = hostkey
                    .hostkey_type()
                    .map(|t| t.name().to_string())
                    .unwrap_or_else(|| "unknown key type".to_string());

                let reply = crate::git::prompts::ask(prompter, |id| {
                    crate::git::prompts::PromptRequest::HostKey {
                        id,
                        host: hostname.to_string(),
                        key_type: key_type.clone(),
                        fingerprint: crate::git::prompts::fingerprint(sha256),
                    }
                });

                if reply.and_then(|r| r.accept) == Some(true) {
                    if let Some(raw) = hostkey.hostkey() {
                        if let Err(e) = crate::git::prompts::remember_host_key(
                            &crate::git::known_hosts::host_entry_name(hostname, ssh_port),
                            &key_type,
                            raw,
                        ) {
                            log::warn!("Could not record the host key for {}: {}", hostname, e);
                        }
                    }
                    Ok(git2::CertificateCheckStatus::CertificateOk)
                } else {
                    Err(git2::Error::from_str(&format!(
                        "The SSH host key of {hostname} was not trusted, so Basilico did not \
                         connect."
                    )))
                }
            }
            // An `@revoked` entry exists precisely so that presenting this key
            // is an error. Refuse without the "this may be a legitimate
            // rotation" hedging the mismatch message carries.
            crate::git::known_hosts::HostKeyVerdict::Revoked => {
                Err(git2::Error::from_str(&format!(
                    "The SSH host key presented by {hostname} is marked @revoked in your \
                     known_hosts file. Refusing to connect. If you believe this is wrong, \
                     remove the @revoked line yourself after verifying the key out of band."
                )))
            }
            crate::git::known_hosts::HostKeyVerdict::Mismatch => {
                Err(git2::Error::from_str(&format!(
                    "The SSH host key presented by {hostname} does not match the one recorded \
                     in your known_hosts file. This can happen after a legitimate host key \
                     rotation, but it is also the classic sign of a man-in-the-middle attack. \
                     Verify the new fingerprint out of band before continuing — for example by \
                     running `ssh-keygen -R {hostname}` and then connecting once with `ssh` \
                     yourself to confirm and record the new key."
                )))
            }
        }
    });

    let transfer = progress.clone();
    callbacks.transfer_progress(move |stats| {
        log::debug!(
            "Transfer: {}/{} objects, {} bytes",
            stats.received_objects(),
            stats.total_objects(),
            stats.received_bytes()
        );
        match &transfer {
            Some(reporter) => {
                let mut reporter = reporter.borrow_mut();
                reporter.report_transfer(&stats);
                // Returning false is how libgit2 is told to stop.
                !reporter.is_cancelled()
            }
            None => true,
        }
    });

    if let Some(progress) = progress {
        // Server messages ("Counting objects…") arrive here before any objects
        // do, so this is the earliest point a fetch can be stopped.
        let sideband = Rc::clone(&progress);
        callbacks.sideband_progress(move |_| !sideband.borrow().is_cancelled());

        let upload = Rc::clone(&progress);
        callbacks.push_transfer_progress(move |current, total, bytes| {
            upload
                .borrow_mut()
                .report("uploading", current, total, bytes);
        });

        // libgit2 offers no way to abort a push mid-upload, but it can still
        // be stopped here, before anything is sent.
        let negotiation = Rc::clone(&progress);
        callbacks.push_negotiation(move |_| {
            if negotiation.borrow().is_cancelled() {
                Err(git2::Error::from_str("The push was cancelled."))
            } else {
                Ok(())
            }
        });
    }

    callbacks
}

/// Manually parses a URL scheme, host, port, and path for git remote URLs
/// without relying on external dependencies like the url crate.
#[cfg(target_os = "windows")]
fn parse_url_manually(
    url: &str,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let parts: Vec<&str> = url.splitn(2, "://").collect();
    if parts.len() < 2 {
        return (None, None, None, None);
    }
    let scheme = parts[0].to_string();
    let remaining = parts[1];

    let host_and_path: Vec<&str> = remaining.splitn(2, '/').collect();
    let host_port = host_and_path[0];
    let path = if host_and_path.len() > 1 {
        Some(host_and_path[1].to_string())
    } else {
        None
    };

    let host_port_split: Vec<&str> = host_port.splitn(2, ':').collect();
    let host = host_port_split[0].to_string();
    let port = if host_port_split.len() > 1 {
        Some(host_port_split[1].to_string())
    } else {
        None
    };

    (Some(scheme), Some(host), port, path)
}

#[cfg(target_os = "windows")]
fn get_git_exec_path() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("git");
    cmd.arg("--exec-path");
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Some(PathBuf::from(path_str));
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn is_in_path(cmd: &str) -> bool {
    if let Ok(path_env) = std::env::var("PATH") {
        for path in std::env::split_paths(&path_env) {
            let exe_path = path.join(cmd);
            if exe_path.exists() {
                return true;
            }
            let exe_path_ext = path.join(format!("{}.exe", cmd));
            if exe_path_ext.exists() {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn resolve_helpers(config: &git2::Config, url: &str) -> Vec<String> {
    let mut helpers = Vec::new();
    let (scheme, host, _, _) = parse_url_manually(url);

    if let (Some(scheme), Some(host)) = (scheme, host) {
        // Scoped helper: credential.https://github.com.helper
        let url_key = format!("credential.{}://{}.helper", scheme, host);
        if let Ok(val) = config.get_string(&url_key) {
            if val.is_empty() {
                helpers.clear();
            } else {
                helpers.push(val);
            }
        }

        // Scoped helper exact URL match
        let exact_key = format!("credential.{}.helper", url);
        if let Ok(val) = config.get_string(&exact_key) {
            if val.is_empty() {
                helpers.clear();
            } else {
                helpers.push(val);
            }
        }
    }

    // Global/default helpers (multivar support)
    if let Ok(mut entries) = config.multivar("credential.helper", None) {
        while let Some(entry_res) = entries.next() {
            if let Ok(entry) = entry_res {
                if let Ok(val) = entry.value() {
                    if val.is_empty() {
                        helpers.clear();
                    } else {
                        helpers.push(val.to_string());
                    }
                }
            }
        }
    }

    helpers
}

#[cfg(target_os = "windows")]
fn execute_custom_helper(
    helper: &str,
    url: &str,
    username: Option<&str>,
) -> Option<(String, String)> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    let (mut cmd_exe, args, is_shell) = if helper.starts_with('!') {
        (
            "cmd.exe".to_string(),
            vec!["/C".to_string(), helper[1..].to_string(), "get".to_string()],
            true,
        )
    } else if helper.contains('/') || helper.contains('\\') {
        (helper.to_string(), vec!["get".to_string()], false)
    } else {
        (
            format!("git-credential-{}", helper),
            vec!["get".to_string()],
            false,
        )
    };

    if !is_shell && !cmd_exe.contains('/') && !cmd_exe.contains('\\') {
        if !is_in_path(&cmd_exe) {
            if let Some(exec_path) = get_git_exec_path() {
                let candidate = exec_path.join(format!("{}.exe", cmd_exe));
                if candidate.exists() {
                    cmd_exe = candidate.to_string_lossy().to_string();
                } else {
                    let candidate_no_ext = exec_path.join(&cmd_exe);
                    if candidate_no_ext.exists() {
                        cmd_exe = candidate_no_ext.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    let mut command = Command::new(&cmd_exe);
    command.args(&args);
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    // CRITICAL: Set CREATE_NO_WINDOW so the spawned helper doesn't flash a console window
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            log::debug!(
                "Failed to spawn custom credential helper {}: {}",
                cmd_exe,
                e
            );
            return None;
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let (scheme, host, port, path) = parse_url_manually(url);
        if let Some(scheme) = scheme {
            let _ = writeln!(stdin, "protocol={}", scheme);
        }
        if let Some(host) = host {
            if let Some(port) = port {
                let _ = writeln!(stdin, "host={}:{}", host, port);
            } else {
                let _ = writeln!(stdin, "host={}", host);
            }
        }
        if let Some(path) = path {
            let _ = writeln!(stdin, "path={}", path);
        }
        if let Some(user) = username {
            let _ = writeln!(stdin, "username={}", user);
        }
        let _ = writeln!(stdin);
        let _ = stdin.flush();
    }

    let output = match child.wait_with_output() {
        Ok(out) => out,
        Err(e) => {
            log::debug!(
                "Failed waiting for custom credential helper {}: {}",
                cmd_exe,
                e
            );
            return None;
        }
    };

    if !output.status.success() {
        log::debug!(
            "Custom credential helper {} failed with code {:?}. Stderr: {}",
            cmd_exe,
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        );
        return None;
    }

    let mut returned_user = None;
    let mut returned_pass = None;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    for line in stdout_str.lines() {
        let parts: Vec<&str> = line.splitn(2, '=').collect();
        if parts.len() == 2 {
            let key = parts[0].trim();
            let val = parts[1].trim();
            if key == "username" {
                returned_user = Some(val.to_string());
            } else if key == "password" {
                returned_pass = Some(val.to_string());
            }
        }
    }

    match (returned_user, returned_pass) {
        (Some(u), Some(p)) => Some((u, p)),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn get_credentials_via_custom_helper(
    config: &git2::Config,
    url: &str,
    username: Option<&str>,
) -> Option<(String, String)> {
    let helpers = resolve_helpers(config, url);
    for helper in helpers {
        if let Some(creds) = execute_custom_helper(&helper, url, username) {
            return Some(creds);
        }
    }
    None
}
