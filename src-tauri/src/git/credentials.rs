use git2::{Cred, CredentialType, RemoteCallbacks};
use std::path::PathBuf;

/// Build remote callbacks with credential handling.
/// Supports SSH agent, SSH key files, and username/password.
pub fn make_callbacks<'a>(custom_ssh_path: Option<String>) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        // Try SSH keys
        if allowed_types.contains(CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            // Try custom key first if provided
            if let Some(ref path_str) = custom_ssh_path {
                let path = PathBuf::from(path_str);
                if path.exists() {
                    return Cred::ssh_key(username, None, &path, None);
                }
            }

            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
            let basilico_path = home.join(".ssh").join("id_basilico");
            let ed25519_path = home.join(".ssh").join("id_ed25519");
            let key_path = home.join(".ssh").join("id_rsa");

            if basilico_path.exists() {
                return Cred::ssh_key(username, None, &basilico_path, None);
            }
            if ed25519_path.exists() {
                return Cred::ssh_key(username, None, &ed25519_path, None);
            }
            if key_path.exists() {
                return Cred::ssh_key(username, None, &key_path, None);
            }

            // Fall back to SSH agent
            return Cred::ssh_key_from_agent(username);
        }

        if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            // For HTTPS — use credential helper or prompt
            #[cfg(target_os = "windows")]
            {
                if let Ok(config) = git2::Config::open_default() {
                    if let Some((username, password)) = get_credentials_via_custom_helper(&config, _url, username_from_url) {
                        return Cred::userpass_plaintext(&username, &password);
                    }
                }
            }

            if let Ok(config) = git2::Config::open_default() {
                if let Ok(cred) = Cred::credential_helper(&config, _url, username_from_url) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.contains(CredentialType::DEFAULT) {
            return Cred::default();
        }

        Err(git2::Error::from_str("no credentials available"))
    });

    callbacks.transfer_progress(|stats| {
        log::debug!(
            "Transfer: {}/{} objects, {} bytes",
            stats.received_objects(),
            stats.total_objects(),
            stats.received_bytes()
        );
        true
    });

    callbacks
}

/// Manually parses a URL scheme, host, port, and path for git remote URLs
/// without relying on external dependencies like the url crate.
#[cfg(target_os = "windows")]
fn parse_url_manually(url: &str) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
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
                if let Some(val) = entry.value() {
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
            log::debug!("Failed to spawn custom credential helper {}: {}", cmd_exe, e);
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
            log::debug!("Failed waiting for custom credential helper {}: {}", cmd_exe, e);
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
