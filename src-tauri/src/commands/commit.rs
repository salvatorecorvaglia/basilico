use crate::error::AppError;
use git2::{Repository, Signature};
use serde::Serialize;

#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
    amend: bool,
) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;
    let mut index = repo.index()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    // Create signature
    let sig = if let (Some(name), Some(email)) = (author_name, author_email) {
        Signature::now(&name, &email)?
    } else {
        repo.signature()
            .unwrap_or_else(|_| Signature::now("Basilico User", "user@basilico.app").unwrap())
    };

    // Calculate parents
    let mut parents = Vec::new();
    let head = repo.head();

    if amend {
        if let Ok(head_ref) = head {
            let parent_commit = head_ref.peel_to_commit()?;
            for i in 0..parent_commit.parent_count() {
                parents.push(parent_commit.parent(i)?);
            }
        }
    } else {
        if let Ok(head_ref) = head {
            if let Ok(parent_commit) = head_ref.peel_to_commit() {
                parents.push(parent_commit);
            }
        }
    }

    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    // Create commit and point HEAD to it
    let commit_id = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parent_refs)?;

    Ok(commit_id.to_string())
}

#[tauri::command]
pub async fn cherry_pick_commit(path: String, oid: String) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;

    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(&["cherry-pick", &oid])
        .output()
        .map_err(|e| AppError::command(format!("Failed to execute cherry-pick process: {}", e)))?;

    match repo.state() {
        git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
            Ok("conflicts".to_string())
        }
        _ => {
            if output.status.success() {
                Ok("success".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(AppError::git(format!("Cherry-pick failed: {}", stderr)))
            }
        }
    }
}

#[tauri::command]
pub async fn cherry_pick_abort(path: String) -> Result<(), AppError> {
    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(&["cherry-pick", "--abort"])
        .output()
        .map_err(|e| AppError::command(format!("Failed to abort cherry-pick process: {}", e)))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::git(format!(
            "Cherry-pick abort failed: {}",
            stderr
        )))
    }
}

#[tauri::command]
pub async fn revert_commit(path: String, oid: String) -> Result<String, AppError> {
    let repo = Repository::open(&path)?;

    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(&["revert", "--no-edit", &oid])
        .output()
        .map_err(|e| AppError::command(format!("Failed to execute revert process: {}", e)))?;

    match repo.state() {
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => {
            Ok("conflicts".to_string())
        }
        _ => {
            if output.status.success() {
                Ok("success".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(AppError::git(format!("Revert failed: {}", stderr)))
            }
        }
    }
}

#[tauri::command]
pub async fn revert_abort(path: String) -> Result<(), AppError> {
    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(&["revert", "--abort"])
        .output()
        .map_err(|e| AppError::command(format!("Failed to abort revert process: {}", e)))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::git(format!("Revert abort failed: {}", stderr)))
    }
}

#[tauri::command]
pub async fn reset_to_commit(path: String, oid: String, mode: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let object = repo.revparse_single(&oid)?;
    let commit = object
        .as_commit()
        .ok_or_else(|| AppError::invalid_state("Object is not a commit"))?;

    let reset_type = match mode.as_str() {
        "soft" => git2::ResetType::Soft,
        "mixed" => git2::ResetType::Mixed,
        "hard" => git2::ResetType::Hard,
        _ => {
            return Err(AppError::invalid_state(format!(
                "Invalid reset mode: {}",
                mode
            )))
        }
    };

    repo.reset(commit.as_object(), reset_type, None)?;
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntryInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
pub async fn get_commit_tree(path: String, oid: String) -> Result<Vec<TreeEntryInfo>, AppError> {
    let repo = Repository::open(&path)?;
    let object = repo.revparse_single(&oid)?;
    let commit = object
        .as_commit()
        .ok_or_else(|| AppError::invalid_state("Object is not a commit"))?;
    let tree = commit.tree()?;

    let mut entries = Vec::new();
    tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
        let name = entry.name().unwrap_or("").to_string();
        let rel_path = if root.is_empty() {
            name.clone()
        } else {
            format!("{}{}", root, name)
        };

        let is_dir = entry.kind() == Some(git2::ObjectType::Tree);
        let size = if !is_dir {
            if let Ok(obj) = entry.to_object(&repo) {
                obj.as_blob().map(|b| b.size() as u64)
            } else {
                None
            }
        } else {
            None
        };

        entries.push(TreeEntryInfo {
            path: rel_path,
            name,
            is_dir,
            size,
        });

        git2::TreeWalkResult::Ok
    })?;

    Ok(entries)
}
