use crate::error::AppError;
use crate::git::helpers;
use git2::{build::CheckoutBuilder, MergeOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn merge_branch(path: String, branch_name: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // Find the branch reference
        let ref_name = format!("refs/heads/{}", branch_name);
        let reference = repo
            .find_reference(&ref_name)
            .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", branch_name)))?;

        let annotated = repo.reference_to_annotated_commit(&reference)?;

        let (merge_analysis, _) = repo.merge_analysis(&[&annotated])?;

        if merge_analysis.is_up_to_date() {
            return Ok("success".to_string());
        }

        if merge_analysis.is_fast_forward() {
            let target_oid = annotated.id();
            let target_object = repo.find_object(target_oid, None)?;
            let mut checkout_opts = CheckoutBuilder::new();
            checkout_opts.safe();
            repo.checkout_tree(&target_object, Some(&mut checkout_opts))?;

            let head_ref = repo.find_reference("HEAD")?;
            if let Some(refname) = head_ref.symbolic_target() {
                let mut real_ref = repo.find_reference(refname)?;
                real_ref.set_target(
                    target_oid,
                    &format!("merge: fast-forward to {}", target_oid),
                )?;
            } else {
                repo.set_head_detached(target_oid)?;
            }
            return Ok("success".to_string());
        }

        let mut merge_opts = MergeOptions::new();
        let mut checkout_opts = CheckoutBuilder::new();
        checkout_opts.safe();

        repo.merge(
            &[&annotated],
            Some(&mut merge_opts),
            Some(&mut checkout_opts),
        )?;

        if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
            Ok("conflicts".to_string())
        } else {
            // Create merge commit to finalize the merge
            let head = repo.head()?.peel_to_commit()?;
            let remote_commit = repo.find_commit(annotated.id())?;
            let msg = format!("Merge branch '{}'", branch_name);
            helpers::create_merge_commit(&repo, &head, &remote_commit, &msg)?;
            Ok("success".to_string())
        }
    })
    .await?
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), AppError> {
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
        let output = crate::commands::new_command("git")
            .current_dir(&path)
            .args(["merge", "--abort"])
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git merge --abort: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::git(format!("Merge abort failed: {}", stderr)));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn get_conflicts(path: String) -> Result<Vec<String>, AppError> {
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
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut index = repo.index()?;

        // Adding resolved file to index clears conflict in git
        index.add_path(Path::new(&file_path))?;
        index.write()?;
        Ok(())
    })
    .await?
}
