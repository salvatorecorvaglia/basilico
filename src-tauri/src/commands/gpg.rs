use crate::error::AppError;
use git2::{Oid, Repository};
use serde::Serialize;
use std::fs;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    pub signature: String,
    pub payload: String,
    pub status: String,
    pub key_id: String,
    pub signer: String,
}

#[tauri::command]
pub async fn get_commit_signature(
    repo_path: String,
    oid_str: String,
) -> Result<Option<SignatureInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let oid = Oid::from_str(&oid_str)?;

        match repo.extract_signature(&oid, None) {
            Ok((sig_buf, payload_buf)) => {
                let signature = String::from_utf8_lossy(&sig_buf).into_owned();
                let payload = String::from_utf8_lossy(&payload_buf).into_owned();

                // Prepare fallback details
                let author_name = repo
                    .find_commit(oid)
                    .ok()
                    .and_then(|c| c.author().name().ok().map(|n| n.to_string()))
                    .unwrap_or_else(|| "Unknown".to_string());

                // A signature that is merely *present* is not a verified one.
                // Start from "Unverified" and only upgrade on an explicit GOODSIG
                // from gpg, so a missing gpg binary or a failed verification is
                // never presented to the user as a trusted signature.
                let mut status = "Unverified".to_string();
                let mut key_id = "GPG Key".to_string();
                let mut signer = author_name.clone();

                // Check if gpg CLI is available
                let temp_dir =
                    std::env::temp_dir().join(format!("basilico_gpg_{}", uuid::Uuid::new_v4()));
                let sig_path = temp_dir.join("commit.sig");
                let payload_path = temp_dir.join("commit.payload");

                // 0700: the payload must not be swappable by another local user
                // between the write below and gpg reading it back.
                let mut builder = std::fs::DirBuilder::new();
                builder.recursive(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::DirBuilderExt;
                    builder.mode(0o700);
                }

                // Attempt to verify with local gpg CLI
                if builder.create(&temp_dir).is_ok() {
                    if fs::write(&sig_path, &*sig_buf).is_ok()
                        && fs::write(&payload_path, &*payload_buf).is_ok()
                    {
                        let mut cmd = crate::commands::new_command("gpg");
                        cmd.arg("--status-fd")
                            .arg("1")
                            .arg("--verify")
                            .arg(&sig_path)
                            .arg(&payload_path);

                        if let Ok(output) = cmd.output() {
                            let stdout_str = String::from_utf8_lossy(&output.stdout);
                            let resolved = parse_gpg_status_output(&stdout_str, &author_name);
                            status = resolved.0;
                            key_id = resolved.1;
                            signer = resolved.2;
                        }
                    }
                    // Clean up
                    let _ = fs::remove_file(&sig_path);
                    let _ = fs::remove_file(&payload_path);
                    let _ = fs::remove_dir(&temp_dir);
                }

                Ok(Some(SignatureInfo {
                    signature,
                    payload,
                    status,
                    key_id,
                    signer,
                }))
            }
            Err(_) => Ok(None),
        }
    })
    .await?
}

/// Parse `gpg --status-fd 1 --verify`'s machine-readable output into
/// `(status, key_id, signer)`. Pulled out of `get_commit_signature` so the
/// state machine can be unit-tested without a real `gpg` binary or keyring.
///
/// `author_name` is the fallback signer shown until a GOODSIG/EXPKEYSIG line
/// supplies a real one — a signature that is merely *present* is not a
/// verified one, so the returned status starts at "Unverified" and only
/// upgrades on an explicit line from gpg.
pub fn parse_gpg_status_output(stdout: &str, author_name: &str) -> (String, String, String) {
    let mut status = "Unverified".to_string();
    let mut key_id = "GPG Key".to_string();
    let mut signer = author_name.to_string();
    let mut resolved_good = false;

    for line in stdout.lines() {
        if let Some(content) = line.strip_prefix("[GNUPG:] GOODSIG ") {
            status = "Verified".to_string();
            let parts: Vec<&str> = content.splitn(2, ' ').collect();
            if parts.len() >= 2 {
                key_id = parts[0].to_string();
                signer = parts[1].to_string();
            }
            resolved_good = true;
        } else if let Some(content) = line.strip_prefix("[GNUPG:] BADSIG ") {
            status = "BadSignature".to_string();
            let parts: Vec<&str> = content.splitn(2, ' ').collect();
            if !parts.is_empty() {
                key_id = parts[0].to_string();
            }
        } else if line.starts_with("[GNUPG:] ERRSIG ") || line.starts_with("[GNUPG:] NO_PUBKEY ") {
            if !resolved_good {
                status = "UnknownKey".to_string();
                if let Some(stripped) = line.strip_prefix("[GNUPG:] NO_PUBKEY ") {
                    key_id = stripped.trim().to_string();
                }
            }
        } else if let Some(content) = line.strip_prefix("[GNUPG:] EXPKEYSIG ") {
            status = "ExpiredKey".to_string();
            let parts: Vec<&str> = content.splitn(2, ' ').collect();
            if parts.len() >= 2 {
                key_id = parts[0].to_string();
                signer = parts[1].to_string();
            }
        }
    }

    (status, key_id, signer)
}
