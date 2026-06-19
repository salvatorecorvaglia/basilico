use crate::git::diff_parser::{FileDiff, get_commit_diff};

#[tauri::command]
pub async fn get_stash_diff(
    repo_path: String,
    stash_oid: String,
) -> Result<Vec<FileDiff>, String> {
    get_commit_diff(&repo_path, &stash_oid).map_err(|e| e.message)
}
