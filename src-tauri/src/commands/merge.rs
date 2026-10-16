use crate::error::AppError;
use crate::git::helpers;
use git2::Repository;
use std::path::Path;

#[tauri::command]
pub async fn merge_branch(
    path: String,
    branch_name: String,
) -> Result<crate::git::helpers::MergeOutcome, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // Find the branch reference
        let ref_name = format!("refs/heads/{}", branch_name);
        let reference = repo
            .find_reference(&ref_name)
            .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", branch_name)))?;

        let annotated = repo.reference_to_annotated_commit(&reference)?;
        let msg = format!("Merge branch '{}'", branch_name);
        helpers::perform_merge(&repo, &annotated, "merge", &msg)
    })
    .await?
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        if repo.state() == git2::RepositoryState::Clean {
            return Err(AppError::invalid_state(
                "There is no merge in progress to abort.",
            ));
        }

        // Delegate to git rather than doing `cleanup_state` + `reset --hard`.
        // `git merge --abort` restores the pre-merge working tree, including
        // uncommitted changes that were compatible with the merge; the manual
        // hard reset discarded them.
        crate::commands::run_git_cmd(&["merge", "--abort"], &path)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn get_conflicts(path: String) -> Result<Vec<String>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let index = repo.index()?;
        let mut conflicts = Vec::new();

        if let Ok(index_conflicts) = index.conflicts() {
            for conflict in index_conflicts.flatten() {
                let path_str = if let Some(our) = conflict.our {
                    Some(String::from_utf8_lossy(&our.path).to_string())
                } else if let Some(their) = conflict.their {
                    Some(String::from_utf8_lossy(&their.path).to_string())
                } else {
                    None
                };

                if let Some(p) = path_str {
                    if !conflicts.contains(&p) {
                        conflicts.push(p);
                    }
                }
            }
        }

        Ok(conflicts)
    })
    .await?
}

#[tauri::command]
pub async fn resolve_conflict(path: String, file_path: String) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let full_path = crate::git::utils::validate_path(workdir, Path::new(&file_path))?;
        let mut index = repo.index()?;

        // Staging the working-tree state clears the conflict, as `git add`
        // does. A file the user deleted resolves the conflict as a deletion:
        // `add_path` would fail on it, so remove the path instead, as `git rm`
        // does. `symlink_metadata` so a dangling symlink still counts as present.
        if std::fs::symlink_metadata(&full_path).is_ok() {
            index.add_path(Path::new(&file_path))?;
        } else {
            index.remove_path(Path::new(&file_path))?;
        }
        index.write()?;
        Ok(())
    })
    .await?
}
