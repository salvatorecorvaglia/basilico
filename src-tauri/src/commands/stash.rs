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
        repo.stash_foreach(|idx, name, oid| {
            entries.push((idx, name.to_string(), *oid));
            true
        })?;

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
    .await?
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
    .await?
}

/// Resolve the stash at `index`, verifying it still holds `expected_oid`.
///
/// Stash indices shift on every push/pop/drop, so an index captured by the UI
/// can point at a different stash by the time the user acts on it (a CLI stash,
/// a concurrent watcher refresh). Acting on the wrong stash is unrecoverable,
/// so we re-resolve by OID and only fall back to the index when the caller has
/// no OID to offer.
fn resolve_stash_index(
    repo: &mut Repository,
    index: usize,
    expected_oid: Option<&str>,
) -> Result<usize, AppError> {
    let expected = match expected_oid {
        Some(oid) if !oid.is_empty() => oid,
        _ => return Ok(index),
    };

    let mut entries: Vec<(usize, String)> = Vec::new();
    repo.stash_foreach(|idx, _name, oid| {
        entries.push((idx, oid.to_string()));
        true
    })?;

    // Fast path: the index still points at the stash the user selected.
    if entries
        .iter()
        .any(|(idx, oid)| *idx == index && oid == expected)
    {
        return Ok(index);
    }

    // The list shifted — find where the selected stash moved to.
    if let Some((idx, _)) = entries.iter().find(|(_, oid)| oid == expected) {
        return Ok(*idx);
    }

    Err(AppError::not_found(
        "That stash no longer exists — the stash list changed since it was displayed. \
         Refresh and try again.",
    ))
}

#[tauri::command]
pub async fn apply_stash(
    path: String,
    index: usize,
    expected_oid: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        let idx = resolve_stash_index(&mut repo, index, expected_oid.as_deref())?;
        repo.stash_apply(idx, None)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn pop_stash(
    path: String,
    index: usize,
    expected_oid: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        let idx = resolve_stash_index(&mut repo, index, expected_oid.as_deref())?;
        repo.stash_pop(idx, None)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn drop_stash(
    path: String,
    index: usize,
    expected_oid: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&path)?;
        let idx = resolve_stash_index(&mut repo, index, expected_oid.as_deref())?;
        repo.stash_drop(idx)?;
        Ok(())
    })
    .await?
}
