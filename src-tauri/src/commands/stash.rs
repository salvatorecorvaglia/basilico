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
pub async fn list_stashes(path: String) -> Result<Vec<StashInfo>, String> {
    let mut repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut stashes = Vec::new();

    // Iterate through stashes
    let _ = repo.stash_foreach(|idx, name, oid| {
        stashes.push(StashInfo {
            index: idx,
            name: name.to_string(),
            oid: oid.to_string(),
            message: name.to_string(),
        });
        true
    });

    Ok(stashes)
}

#[tauri::command]
pub async fn save_stash(
    path: String,
    message: String,
    include_untracked: bool,
) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // Find default signature
    let sig = repo
        .signature()
        .or_else(|_| git2::Signature::now("Basilico", "basilico@example.com"))
        .map_err(|e| e.to_string())?;

    let mut flags = StashFlags::DEFAULT;
    if include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }

    repo.stash_save(&sig, &message, Some(flags))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn apply_stash(path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| e.to_string())?;
    repo.stash_apply(index, None).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pop_stash(path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| e.to_string())?;
    repo.stash_pop(index, None).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn drop_stash(path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| e.to_string())?;
    repo.stash_drop(index).map_err(|e| e.to_string())?;
    Ok(())
}
