use crate::error::AppError;
use git2::{Repository, StashFlags};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    pub index: usize,
    pub name: String,
    pub oid: String,
    pub message: String,
}

#[tauri::command]
pub async fn list_stashes(path: String) -> Result<Vec<StashInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        let mut stashes = Vec::new();
        let mut entries = Vec::new();

        // Iterate through stashes and collect fields to avoid borrow checker issues
        let _ = repo.stash_foreach(|idx, name, oid| {
            entries.push((idx, name.to_string(), *oid));
            true
        });

        for (idx, name, oid) in entries {
            let msg = repo
                .find_commit(oid)
                .ok()
                .and_then(|c| c.message().map(|m| m.trim().to_string()))
                .unwrap_or_else(|| name.clone());

            stashes.push(StashInfo {
                index: idx,
                name,
                oid: oid.to_string(),
                message: msg,
            });
        }

        Ok(stashes)
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn save_stash(
    path: String,
    message: String,
    include_untracked: bool,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;

        // Find default signature
        let sig = repo.signature().map_err(|_| {
            AppError::invalid_state(
                "Git author name and email are not configured. \
                 Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
            )
        })?;

        let mut flags = StashFlags::DEFAULT;
        if include_untracked {
            flags |= StashFlags::INCLUDE_UNTRACKED;
        }

        repo.stash_save(&sig, &message, Some(flags))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn apply_stash(path: String, index: usize) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        repo.stash_apply(index, None)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn pop_stash(path: String, index: usize) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        repo.stash_pop(index, None)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn drop_stash(path: String, index: usize) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        repo.stash_drop(index)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}
