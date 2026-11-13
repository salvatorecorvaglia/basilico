use crate::error::AppError;
use crate::git::helpers::require_signature;
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
    crate::state::ensure_open_repo(&path)?;
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
                .and_then(|c| c.message().ok().map(|m| m.trim().to_string()))
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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let mut repo = Repository::open(&path)?;

        // Find default signature
        let sig = require_signature(&repo)?;

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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let mut repo = Repository::open(&path)?;
        let idx = resolve_stash_index(&mut repo, index, expected_oid.as_deref())?;
        repo.stash_drop(idx)?;
        Ok(())
    })
    .await?
}

/// Keep branch creation, checkout, index restoration and stash removal on one repository.
#[tauri::command]
pub async fn branch_from_stash(
    path: String,
    branch_name: String,
    expected_oid: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    crate::commands::validate_git_argument(&branch_name, "Branch name")?;
    let oid = git2::Oid::from_str(&expected_oid)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&path)?;

        let mut repo = Repository::open(&path)?;
        resolve_stash_index(&mut repo, 0, Some(&expected_oid))?;
        // An OID pins what is applied even if another process changes stash indices.
        // Git keeps a stash referenced by OID; remove it only after successful application.
        let output = crate::commands::git_output(
            &["stash", "branch", &branch_name, &oid.to_string()],
            &path,
        )?;
        if !output.status.success() {
            return Err(AppError::git(crate::commands::git_failure_message(
                &["stash", "branch"],
                &output,
            )));
        }
        let idx = resolve_stash_index(&mut repo, 0, Some(&expected_oid))?;
        repo.stash_drop(idx)?;
        Ok(())
    })
    .await?
}
