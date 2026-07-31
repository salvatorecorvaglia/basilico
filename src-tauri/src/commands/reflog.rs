/* ═══════════════════════════════════════════════════════
Basilico — Reflog Commands
Inspection and state restoration via git reflog
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use git2::{Repository, ResetType};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub index: usize,
    pub old_oid: String,
    pub new_oid: String,
    pub committer_name: String,
    pub committer_email: String,
    pub date: i64,
    pub message: String,
}

#[tauri::command]
pub async fn get_reflog(
    repo_path: String,
    ref_name: Option<String>,
    max_count: Option<usize>,
) -> Result<Vec<ReflogEntry>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let target_ref = ref_name.as_deref().unwrap_or("HEAD");
        let reflog = repo.reflog(target_ref)?;

        let limit = max_count.unwrap_or(200);
        let mut entries = Vec::new();

        for (idx, entry) in reflog.iter().enumerate().take(limit) {
            let committer = entry.committer();
            entries.push(ReflogEntry {
                index: idx,
                old_oid: entry.id_old().to_string(),
                new_oid: entry.id_new().to_string(),
                committer_name: committer.name().unwrap_or("").to_string(),
                committer_email: committer.email().unwrap_or("").to_string(),
                date: committer.when().seconds(),
                message: entry.message().unwrap_or("").to_string(),
            });
        }

        Ok(entries)
    })
    .await?
}

#[tauri::command]
pub async fn restore_reflog_entry(
    repo_path: String,
    oid: String,
    mode: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let target_oid = git2::Oid::from_str(&oid)
            .map_err(|e| AppError::invalid_state(format!("Invalid commit OID: {}", e)))?;
        let commit = repo.find_commit(target_oid)?;

        let reset_type = match mode.to_lowercase().as_str() {
            "soft" => ResetType::Soft,
            "mixed" => ResetType::Mixed,
            "hard" => ResetType::Hard,
            _ => {
                return Err(AppError::invalid_state(
                    "Invalid reset mode. Must be 'soft', 'mixed', or 'hard'",
                ))
            }
        };

        repo.reset(commit.as_object(), reset_type, None)?;
        Ok(())
    })
    .await?
}
