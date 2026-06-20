use git2::{Cred, CredentialType, RemoteCallbacks};
use std::path::PathBuf;

/// Build remote callbacks with credential handling.
/// Supports SSH agent, SSH key files, and username/password.
pub fn make_callbacks<'a>(custom_ssh_path: Option<String>) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        // Try SSH keys
        if allowed_types.contains(CredentialType::SSH_KEY) {
            if let Some(username) = username_from_url {
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
        }

        if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            // For HTTPS — use credential helper or prompt
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
