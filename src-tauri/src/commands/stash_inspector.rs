use crate::error::AppError;
use crate::git::diff_parser::{get_commit_diff, parse_diff, FileDiff};
use git2::Repository;

#[tauri::command]
pub async fn get_stash_diff(
    repo_path: String,
    stash_oid: String,
) -> Result<Vec<FileDiff>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let oid = git2::Oid::from_str(&stash_oid)?;
        let commit = repo.find_commit(oid)?;

        let mut diffs = get_commit_diff(&repo_path, &stash_oid)?;

        if commit.parent_count() >= 3 {
            let untracked_commit = commit.parent(2)?;
            let untracked_tree = untracked_commit.tree()?;
            let mut opts = git2::DiffOptions::new();
            let untracked_diff =
                repo.diff_tree_to_tree(None, Some(&untracked_tree), Some(&mut opts))?;
            let mut parsed_untracked = parse_diff(&untracked_diff)?;

            for f in &mut parsed_untracked {
                f.status = "untracked".to_string();
            }

            diffs.extend(parsed_untracked);
        }

        Ok(diffs)
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}
