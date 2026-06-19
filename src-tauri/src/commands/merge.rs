use crate::error::AppError;
use git2::{build::CheckoutBuilder, MergeOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn merge_branch(path: String, branch_name: String) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;

    // Find the branch reference
    let ref_name = format!("refs/heads/{}", branch_name);
    let reference = repo
        .find_reference(&ref_name)
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", branch_name)))?;

    let annotated = repo.reference_to_annotated_commit(&reference)?;

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
        Ok("success".to_string())
    }
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;

    // Clean up merge state files
    repo.cleanup_state()?;

    if let Ok(head_ref) = repo.head() {
        if let Ok(commit) = head_ref.peel_to_commit() {
            repo.reset(commit.as_object(), git2::ResetType::Hard, None)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_conflicts(path: String) -> Result<Vec<String>, AppError> {
    let repo = Repository::open(&path)?;
    let index = repo.index()?;
    let mut conflicts = Vec::new();

    if let Ok(index_conflicts) = index.conflicts() {
        for entry in index_conflicts {
            if let Ok(conflict) = entry {
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
    }

    Ok(conflicts)
}

#[tauri::command]
pub async fn resolve_conflict(path: String, file_path: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut index = repo.index()?;

    // Adding resolved file to index clears conflict in git
    index.add_path(Path::new(&file_path))?;
    index.write()?;
    Ok(())
}
