/* ═══════════════════════════════════════════════════════
Basilico — Reflog Commands
Retrieve git reflog records for HEAD
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntryInfo {
    pub index: usize,
    pub old_oid: String,
    pub new_oid: String,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_date: i64,
    pub message: String,
}

#[tauri::command]
pub async fn get_reflog(path: String) -> Result<Vec<ReflogEntryInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;

        let reflog = match repo.reflog("HEAD") {
            Ok(rl) => rl,
            Err(_) => return Ok(Vec::new()), // Return empty if no reflog exists (e.g. empty repository)
        };

        let mut entries = Vec::new();
        for (idx, entry) in reflog.iter().enumerate() {
            let old_oid = entry.id_old().to_string();
            let new_oid = entry.id_new().to_string();
            let committer = entry.committer();
            let committer_name = committer.name().unwrap_or("Unknown").to_string();
            let committer_email = committer.email().unwrap_or("").to_string();
            let committer_date = committer.when().seconds();

            entries.push(ReflogEntryInfo {
                index: idx,
                old_oid,
                new_oid,
                committer_name,
                committer_email,
                committer_date,
                message: entry.message().unwrap_or("").to_string(),
            });
        }

        // Reverse so that newest reflog entry is first
        entries.reverse();
        Ok(entries)
    })
    .await?
}
