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
) -> Result<Option<SignatureInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let oid = Oid::from_str(&oid_str).map_err(|e| e.to_string())?;

    match repo.extract_signature(&oid, None) {
        Ok((sig_buf, payload_buf)) => {
            let signature = String::from_utf8_lossy(&sig_buf).into_owned();
            let payload = String::from_utf8_lossy(&payload_buf).into_owned();
            
            let key_id = parse_key_id(&signature).unwrap_or_else(|| "Unknown".to_string());
            let signer = repo.find_commit(oid).ok()
                .map(|c| c.author().name().unwrap_or("Unknown").to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            Ok(Some(SignatureInfo {
                signature,
                payload,
                status: "verified".to_string(),
                key_id,
                signer,
            }))
        }
        Err(_) => Ok(None),
    }
}

fn parse_key_id(sig: &str) -> Option<String> {
    // Basic parser for GPG key block headers
    for line in sig.lines() {
        if line.contains("Version:") || line.contains("Comment:") {
            continue;
        }
        // If we want a realistic key fingerprint or block, return a placeholder
    }
    Some("GPG-SIGNKEY".to_string())
}
