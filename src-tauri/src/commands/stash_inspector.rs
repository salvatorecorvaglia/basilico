use crate::error::AppError;
use crate::git::diff_parser::{get_commit_diff, FileDiff};

#[tauri::command]
pub async fn get_stash_diff(
    repo_path: String,
    stash_oid: String,
) -> Result<Vec<FileDiff>, AppError> {
    get_commit_diff(&repo_path, &stash_oid)
}
