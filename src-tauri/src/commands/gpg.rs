use crate::error::AppError;
use git2::{Oid, Repository};
use serde::Serialize;

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
    let repo = Repository::open(&repo_path)?;
    let oid = Oid::from_str(&oid_str)?;

    match repo.extract_signature(&oid, None) {
        Ok((sig_buf, payload_buf)) => {
            let signature = String::from_utf8_lossy(&sig_buf).into_owned();
            let payload = String::from_utf8_lossy(&payload_buf).into_owned();

            let key_id = parse_key_id(&signature).unwrap_or_else(|| "GPG Key".to_string());
            let signer = repo
                .find_commit(oid)
                .ok()
                .map(|c| c.author().name().unwrap_or("Unknown").to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            Ok(Some(SignatureInfo {
                signature,
                payload,
                status: "Signed".to_string(),
                key_id,
                signer,
            }))
        }
        Err(_) => Ok(None),
    }
}

fn parse_key_id(_sig: &str) -> Option<String> {
    Some("GPG Key".to_string())
}
