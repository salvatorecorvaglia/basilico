use git2::{Cred, CredentialType, RemoteCallbacks};

/// Build remote callbacks with credential handling.
/// Supports SSH agent, SSH key files, and username/password.
pub fn make_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();

    callbacks.credentials(|_url, username_from_url, allowed_types| {
        // Try SSH agent first
        if allowed_types.contains(CredentialType::SSH_KEY) {
            if let Some(username) = username_from_url {
                // Try the default SSH key locations
                let home = dirs_home();
                let key_path = home.join(".ssh").join("id_rsa");
                let ed25519_path = home.join(".ssh").join("id_ed25519");

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
            if let Ok(cred) = Cred::credential_helper(
                &git2::Config::open_default().unwrap(),
                _url,
                username_from_url,
            ) {
                return Ok(cred);
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

fn dirs_home() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::path::PathBuf::from("C:\\"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::path::PathBuf::from("/"))
    }
}
