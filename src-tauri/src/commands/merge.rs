use git2::{Repository, MergeOptions, build::CheckoutBuilder};
use std::path::Path;

#[tauri::command]
pub async fn merge_branch(path: String, branch_name: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // Find the branch reference
    let ref_name = format!("refs/heads/{}", branch_name);
    let reference = repo
        .find_reference(&ref_name)
        .or_else(|_| repo.find_reference(&format!("refs/remotes/{}", branch_name)))
        .map_err(|e| e.to_string())?;

    let annotated = repo
        .reference_to_annotated_commit(&reference)
        .map_err(|e| e.to_string())?;

    let mut merge_opts = MergeOptions::new();
    let mut checkout_opts = CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(&[&annotated], Some(&mut merge_opts), Some(&mut checkout_opts))
        .map_err(|e| e.to_string())?;

    if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
        Ok("conflicts".to_string())
    } else {
        Ok("success".to_string())
    }
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // Clean up merge state files
    repo.cleanup_state().map_err(|e| e.to_string())?;

    // Reset working directory to HEAD
    if let Ok(head_ref) = repo.head() {
        if let Ok(commit) = head_ref.peel_to_commit() {
            let mut opts = CheckoutBuilder::new();
            opts.force();
            repo.checkout_tree(commit.as_object(), Some(&mut opts))
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_conflicts(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let index = repo.index().map_err(|e| e.to_string())?;
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
pub async fn resolve_conflict(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;

    // Adding resolved file to index clears conflict in git
    index
        .add_path(Path::new(&file_path))
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}
