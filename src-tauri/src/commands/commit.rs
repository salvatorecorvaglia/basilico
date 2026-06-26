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
    tokio::task::spawn_blocking(move || {
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

        // Create commit and point HEAD to it
        let commit_id = if amend {
            let head_ref = repo.head()?;
            let commit_to_amend = head_ref.peel_to_commit()?;
            commit_to_amend.amend(
                Some("HEAD"),
                Some(&sig),
                Some(&sig),
                None,
                Some(&message),
                Some(&tree),
            )?
        } else {
            let mut parents = Vec::new();
            if let Ok(head_ref) = repo.head() {
                if let Ok(parent_commit) = head_ref.peel_to_commit() {
                    parents.push(parent_commit);
                }
            }

            let has_merge_head = repo.find_reference("MERGE_HEAD").is_ok();
            if let Ok(merge_ref) = repo.find_reference("MERGE_HEAD") {
                if let Ok(merge_commit) = merge_ref.peel_to_commit() {
                    parents.push(merge_commit);
                }
            }

            let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
            let commit_oid =
                repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parent_refs)?;

            if has_merge_head {
                let _ = repo.cleanup_state();
            }
            commit_oid
        };

        Ok(commit_id.to_string())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn cherry_pick_commit(path: String, oid: String) -> Result<String, AppError> {
    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(["cherry-pick", &oid])
        .output()
        .map_err(|e| AppError::command(format!("Failed to execute cherry-pick process: {}", e)))?;

    let repo = Repository::open(&path)?;
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
        .args(["cherry-pick", "--abort"])
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
    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(["revert", "--no-edit", &oid])
        .output()
        .map_err(|e| AppError::command(format!("Failed to execute revert process: {}", e)))?;

    let repo = Repository::open(&path)?;
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
        .args(["revert", "--abort"])
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
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
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
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[tokio::test]
    async fn test_create_commit_and_amend() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");

        // Stage files (since create_commit commits the index)
        let mut index = repo.repo.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();

        // Create initial commit
        let commit_oid = create_commit(
            repo.path_str().to_string(),
            "Initial Commit".to_string(),
            Some("Test Author".to_string()),
            Some("author@example.com".to_string()),
            false,
        )
        .await
        .unwrap();

        // Verify the commit was created
        let commit = repo
            .repo
            .find_commit(git2::Oid::from_str(&commit_oid).unwrap())
            .unwrap();
        assert_eq!(commit.message().unwrap(), "Initial Commit");
        assert_eq!(commit.author().name().unwrap(), "Test Author");

        // Amend the commit
        repo.write_file("test.txt", "hello amended");
        let mut index = repo.repo.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();

        let amended_oid = create_commit(
            repo.path_str().to_string(),
            "Amended Commit".to_string(),
            Some("Test Author".to_string()),
            Some("author@example.com".to_string()),
            true,
        )
        .await
        .unwrap();

        // Verify that HEAD is now the amended commit and has the same parent count (which is 0 since it is initial)
        let amended_commit = repo
            .repo
            .find_commit(git2::Oid::from_str(&amended_oid).unwrap())
            .unwrap();
        assert_eq!(amended_commit.message().unwrap(), "Amended Commit");
        assert_eq!(amended_commit.parent_count(), 0);
    }

    #[tokio::test]
    async fn test_reset_to_commit() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        let initial_oid = repo.repo.head().unwrap().target().unwrap();

        repo.write_file("test2.txt", "hello 2");
        repo.commit("commit 2");

        let _commit_2_oid = repo.repo.head().unwrap().target().unwrap();

        // Reset to initial commit
        reset_to_commit(
            repo.path_str().to_string(),
            initial_oid.to_string(),
            "hard".to_string(),
        )
        .await
        .unwrap();

        // Verify that HEAD points to initial commit
        let head_oid = repo.repo.head().unwrap().target().unwrap();
        assert_eq!(head_oid, initial_oid);
    }

    #[tokio::test]
    async fn test_get_commit_tree() {
        let repo = TempRepo::new();
        repo.write_file("dir/test.txt", "hello inside");
        repo.commit("initial commit");

        let head_oid = repo.repo.head().unwrap().target().unwrap();

        let entries = get_commit_tree(repo.path_str().to_string(), head_oid.to_string())
            .await
            .unwrap();

        // Should have "dir" and "dir/test.txt"
        assert!(entries.iter().any(|e| e.name == "dir" && e.is_dir));
        assert!(entries
            .iter()
            .any(|e| e.name == "test.txt" && !e.is_dir && e.path == "dir/test.txt"));
    }
}
