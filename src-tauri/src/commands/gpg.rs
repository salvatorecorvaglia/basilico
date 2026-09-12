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
                        // `--batch --no-tty` so gpg can never stop to ask:
                        // verification runs on a blocking-pool thread with
                        // stdin inherited, and a pinentry prompt there would
                        // hang that thread for the life of the process with
                        // nothing on screen to explain why.
                        let mut cmd = crate::commands::new_command("gpg");
                        cmd.arg("--batch")
                            .arg("--no-tty")
                            .arg("--status-fd")
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
/// `author_name` is the fallback signer shown until gpg supplies a real one — a
/// signature that is merely *present* is not a verified one, so the returned
/// status starts at "Unverified" and only upgrades on explicit lines.
///
/// Trust, not just validity, decides "Verified". `GOODSIG` alone means only
/// that the signature checks out against *some* key in the local keyring — it
/// says nothing about that key being trusted or belonging to the commit's
/// author, and the displayed signer name is taken from the key's own UID, which
/// its creator chose. Treating `GOODSIG` as "Verified" therefore handed a green
/// check to anyone who could get a key into the user's keyring. gpg reports the
/// calculated trust separately, so a good signature from an untrusted key is
/// now its own status rather than a verified one.
///
/// Every line is collected first and the status resolved afterwards. The
/// previous in-loop assignment let a late `EXPKEYSIG` overwrite an already
/// resolved result, which the `ERRSIG`/`NO_PUBKEY` arm had to guard against by
/// hand; resolving once at the end makes the precedence explicit and total.
pub fn parse_gpg_status_output(stdout: &str, author_name: &str) -> (String, String, String) {
    let mut key_id = "GPG Key".to_string();
    let mut signer = author_name.to_string();

    let mut good = false;
    let mut valid = false;
    let mut trusted = false;
    let mut bad = false;
    let mut revoked = false;
    let mut expired = false;
    let mut unknown_key = false;
    let mut unknown_key_id: Option<String> = None;

    // Pull `<key id> <signer name>` out of a status line's payload, recording
    // whichever fields are present.
    let take_key_and_signer = |content: &str, key_id: &mut String, signer: &mut String| {
        let parts: Vec<&str> = content.splitn(2, ' ').collect();
        if parts.len() >= 2 {
            *key_id = parts[0].to_string();
            *signer = parts[1].to_string();
        }
    };

    for line in stdout.lines() {
        if let Some(content) = line.strip_prefix("[GNUPG:] GOODSIG ") {
            good = true;
            take_key_and_signer(content, &mut key_id, &mut signer);
        } else if let Some(content) = line.strip_prefix("[GNUPG:] BADSIG ") {
            bad = true;
            let parts: Vec<&str> = content.splitn(2, ' ').collect();
            if !parts.is_empty() {
                key_id = parts[0].to_string();
            }
        } else if let Some(content) = line.strip_prefix("[GNUPG:] REVKEYSIG ") {
            revoked = true;
            take_key_and_signer(content, &mut key_id, &mut signer);
        } else if let Some(content) = line.strip_prefix("[GNUPG:] EXPKEYSIG ") {
            expired = true;
            take_key_and_signer(content, &mut key_id, &mut signer);
        } else if line.starts_with("[GNUPG:] VALIDSIG") {
            valid = true;
        } else if line.starts_with("[GNUPG:] TRUST_ULTIMATE")
            || line.starts_with("[GNUPG:] TRUST_FULLY")
            || line.starts_with("[GNUPG:] TRUST_MARGINAL")
        {
            trusted = true;
        } else if line.starts_with("[GNUPG:] ERRSIG ") || line.starts_with("[GNUPG:] NO_PUBKEY ") {
            unknown_key = true;
            // Held aside rather than written straight to `key_id`: these lines
            // can belong to a *second*, unrelated signature block, and
            // overwriting would relabel an otherwise good signature with the
            // wrong key. Only used below if nothing better was resolved.
            if let Some(stripped) = line.strip_prefix("[GNUPG:] NO_PUBKEY ") {
                unknown_key_id = Some(stripped.trim().to_string());
            }
        }
    }

    // Most alarming state wins. A revoked or expired key still produced a
    // cryptographically good signature, so those are reported ahead of the
    // GOODSIG that accompanies them.
    let status = if bad {
        "BadSignature"
    } else if revoked {
        "RevokedKey"
    } else if expired {
        "ExpiredKey"
    } else if good && valid && trusted {
        "Verified"
    } else if good {
        // Cryptographically fine, but gpg did not vouch for the key: either no
        // TRUST_* line at all, or TRUST_UNDEFINED/TRUST_NEVER.
        "UntrustedKey"
    } else if unknown_key {
        if let Some(id) = unknown_key_id {
            key_id = id;
        }
        "UnknownKey"
    } else {
        "Unverified"
    };

    (status.to_string(), key_id, signer)
}
