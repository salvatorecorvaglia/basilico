use crate::error::AppError;
use crate::git::repository;
use git2::Repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || repository::list_branches(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let target = match start_point {
            Some(ref s) => {
                let obj = repo.revparse_single(s)?;
                obj.as_commit()
                    .ok_or_else(|| AppError::invalid_state("Start point is not a commit"))?
                    .clone()
            }
            None => {
                let head = repo.head()?;
                head.peel_to_commit()?
            }
        };

        repo.branch(&name, &target, false)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, is_remote: bool) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        if is_remote {
            let ref_name = format!("refs/remotes/{}", name);
            let mut reference = repo.find_reference(&ref_name)?;
            reference.delete()?;
        } else {
            let mut branch = repo.find_branch(&name, git2::BranchType::Local)?;
            branch.delete()?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn checkout_branch(path: String, name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // Check if name is a direct 40-character hexadecimal commit OID
        if git2::Oid::from_str(&name).is_ok() {
            let oid = git2::Oid::from_str(&name)?;
            let commit = repo.find_commit(oid)?;
            let obj = commit.into_object();

            let mut opts = git2::build::CheckoutBuilder::new();
            opts.safe();
            repo.checkout_tree(&obj, Some(&mut opts))?;
            repo.set_head_detached(oid)?;
            return Ok(());
        }

        // Check if it is a tag reference (refs/tags/...)
        if name.starts_with("refs/tags/") {
            let reference = repo.find_reference(&name)?;
            let commit = reference.peel_to_commit()?;
            let obj = commit.clone().into_object();

            let mut opts = git2::build::CheckoutBuilder::new();
            opts.safe();
            repo.checkout_tree(&obj, Some(&mut opts))?;
            repo.set_head_detached(commit.id())?;
            return Ok(());
        }

        // Handle normal branches and remote branches
        let ref_name = if repo.find_branch(&name, git2::BranchType::Local).is_ok() {
            format!("refs/heads/{}", name)
        } else if name.contains('/') && !name.starts_with("refs/") {
            // Handle remote branches: "origin/feature" -> checkout local tracking branch "feature"
            let parts: Vec<&str> = name.splitn(2, '/').collect();
            if parts.len() == 2 {
                let local_name = parts[1];
                if let Ok(local_branch) = repo.find_branch(local_name, git2::BranchType::Local) {
                    local_branch.get().name().unwrap_or("").to_string()
                } else {
                    let remote_ref = format!("refs/remotes/{}", name);
                    let remote_reference = repo.find_reference(&remote_ref)?;
                    let commit = remote_reference.peel_to_commit()?;
                    let mut new_branch = repo.branch(local_name, &commit, false)?;
                    new_branch.set_upstream(Some(&name)).ok();
                    new_branch.get().name().unwrap_or("").to_string()
                }
            } else {
                format!("refs/heads/{}", name)
            }
        } else if name.starts_with("refs/") {
            name.clone()
        } else {
            format!("refs/heads/{}", name)
        };

        let obj = repo.revparse_single(&ref_name)?;
        let mut opts = git2::build::CheckoutBuilder::new();
        opts.safe(); // Prevents checkout if it overwrites local dirty changes
        repo.checkout_tree(&obj, Some(&mut opts))?;

        repo.set_head(&ref_name)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rename_branch(
    path: String,
    current_name: String,
    new_name: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut branch = repo.find_branch(&current_name, git2::BranchType::Local)?;
        branch.rename(&new_name, false)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[tokio::test]
    async fn test_checkout_branch_with_slash() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        // Create branch with slash
        create_branch(
            repo.path_str().to_string(),
            "feature/test-slash".to_string(),
            None,
        )
        .await
        .unwrap();

        // Checkout branch
        checkout_branch(
            repo.path_str().to_string(),
            "feature/test-slash".to_string(),
        )
        .await
        .unwrap();

        // Verify HEAD is pointed to the new branch
        let head = repo.repo.head().unwrap();
        assert_eq!(head.name().unwrap(), "refs/heads/feature/test-slash");
    }

    #[tokio::test]
    async fn test_create_rename_delete_branch() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        let path = repo.path_str().to_string();

        // 1. Create branch
        create_branch(path.clone(), "feature/new-branch".to_string(), None)
            .await
            .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        let created_branch = branches.iter().find(|b| b.name == "feature/new-branch");
        assert!(created_branch.is_some());

        // 2. Rename branch
        rename_branch(path.clone(), "feature/new-branch".to_string(), "feature/renamed-branch".to_string())
            .await
            .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        assert!(branches.iter().find(|b| b.name == "feature/new-branch").is_none());
        assert!(branches.iter().find(|b| b.name == "feature/renamed-branch").is_some());

        // 3. Delete branch
        delete_branch(path.clone(), "feature/renamed-branch".to_string(), false)
            .await
            .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        assert!(branches.iter().find(|b| b.name == "feature/renamed-branch").is_none());
    }
}
