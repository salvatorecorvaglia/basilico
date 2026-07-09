use crate::error::AppError;
use git2::{Oid, Repository};
use serde::Serialize;
use std::fs;
use std::process::Command;

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
                    .and_then(|c| c.author().name().map(|n| n.to_string()))
                    .unwrap_or_else(|| "Unknown".to_string());

                let mut status = "Signed".to_string();
                let mut key_id = "GPG Key".to_string();
                let mut signer = author_name.clone();

                // Check if gpg CLI is available
                let temp_dir = repo.path().join("basilico_temp");
                let sig_path = temp_dir.join(format!("{}.sig", oid_str));
                let payload_path = temp_dir.join(format!("{}.payload", oid_str));

                // Attempt to verify with local gpg CLI
                if fs::create_dir_all(&temp_dir).is_ok() {
                    if fs::write(&sig_path, &*sig_buf).is_ok() && fs::write(&payload_path, &*payload_buf).is_ok() {
                        let mut cmd = Command::new("gpg");
                        cmd.arg("--status-fd").arg("1").arg("--verify").arg(&sig_path).arg(&payload_path);
                        
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                        }

                        if let Ok(output) = cmd.output() {
                            let stdout_str = String::from_utf8_lossy(&output.stdout);
                            let mut resolved_good = false;
                            
                            for line in stdout_str.lines() {
                                if line.starts_with("[GNUPG:] GOODSIG ") {
                                    status = "Verified".to_string();
                                    let content = &line["[GNUPG:] GOODSIG ".len()..];
                                    let parts: Vec<&str> = content.splitn(2, ' ').collect();
                                    if parts.len() >= 2 {
                                        key_id = parts[0].to_string();
                                        signer = parts[1].to_string();
                                    }
                                    resolved_good = true;
                                } else if line.starts_with("[GNUPG:] BADSIG ") {
                                    status = "BadSignature".to_string();
                                    let content = &line["[GNUPG:] BADSIG ".len()..];
                                    let parts: Vec<&str> = content.splitn(2, ' ').collect();
                                    if parts.len() >= 1 {
                                        key_id = parts[0].to_string();
                                    }
                                } else if line.starts_with("[GNUPG:] ERRSIG ") || line.starts_with("[GNUPG:] NO_PUBKEY ") {
                                    if !resolved_good {
                                        status = "UnknownKey".to_string();
                                        if line.starts_with("[GNUPG:] NO_PUBKEY ") {
                                            key_id = line["[GNUPG:] NO_PUBKEY ".len()..].trim().to_string();
                                        }
                                    }
                                } else if line.starts_with("[GNUPG:] EXPKEYSIG ") {
                                    status = "ExpiredKey".to_string();
                                    let content = &line["[GNUPG:] EXPKEYSIG ".len()..];
                                    let parts: Vec<&str> = content.splitn(2, ' ').collect();
                                    if parts.len() >= 2 {
                                        key_id = parts[0].to_string();
                                        signer = parts[1].to_string();
                                    }
                                }
                            }
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
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}
