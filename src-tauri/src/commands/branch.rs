use crate::error::AppError;
use crate::git::repository;
use git2::Repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || repository::list_branches(&path)).await?
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
    .await?
}

#[tauri::command]
pub async fn delete_branch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    name: String,
    is_remote: bool,
) -> Result<(), AppError> {
    let ssh_key_path = crate::commands::settings::get_custom_ssh_path(&app);
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        if is_remote {
            // name is formatted as "remote_name/branch_name" (e.g. "origin/my-feature")
            let parts: Vec<&str> = name.splitn(2, '/').collect();
            if parts.len() == 2 {
                let remote_name = parts[0];
                let branch_name = parts[1];

                // 1. Push deletion spec to remote repository
                let mut remote_obj = repo.find_remote(remote_name)?;
                let refspec = format!(":refs/heads/{}", branch_name);

                let mut push_opts = git2::PushOptions::new();
                push_opts.remote_callbacks(crate::git::credentials::make_callbacks(ssh_key_path));

                remote_obj.push(&[refspec.as_str()], Some(&mut push_opts))?;
            }

            // 2. Delete the local remote-tracking reference
            let ref_name = format!("refs/remotes/{}", name);
            if let Ok(mut reference) = repo.find_reference(&ref_name) {
                reference.delete()?;
            }
        } else {
            let mut branch = repo.find_branch(&name, git2::BranchType::Local)?;
            branch.delete()?;
        }
        Ok(())
    })
    .await?
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
    .await?
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
    .await?
}

#[tauri::command]
pub async fn list_merged_branches(
    path: String,
    target_branch: Option<String>,
) -> Result<Vec<repository::BranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        let target_name = target_branch.unwrap_or_else(|| "HEAD".to_string());
        let target_obj = repo.revparse_single(&target_name)?;
        let target_commit = target_obj.peel_to_commit()?;
        let target_oid = target_commit.id();

        let all_branches = repository::list_branches(&path)?;
        let mut merged_branches = Vec::new();

        for b in all_branches {
            // Skip HEAD or current branch if it matches target
            if b.is_head {
                continue;
            }
            if b.name == target_name {
                continue;
            }

            let branch_oid_res = git2::Oid::from_str(&b.oid);
            if let Ok(b_oid) = branch_oid_res {
                if b_oid == target_oid {
                    merged_branches.push(b);
                    continue;
                }
                // Check if target_oid is descendant of b_oid (b_oid is ancestor of target_oid)
                if let Ok(is_descendant) = repo.graph_descendant_of(target_oid, b_oid) {
                    if is_descendant {
                        merged_branches.push(b);
                    }
                }
            }
        }

        Ok(merged_branches)
    })
    .await?
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
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
            .handle()
            .clone();

        // 1. Create branch
        create_branch(path.clone(), "feature/new-branch".to_string(), None)
            .await
            .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        let created_branch = branches.iter().find(|b| b.name == "feature/new-branch");
        assert!(created_branch.is_some());

        // 2. Rename branch
        rename_branch(
            path.clone(),
            "feature/new-branch".to_string(),
            "feature/renamed-branch".to_string(),
        )
        .await
        .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        assert!(branches
            .iter()
            .find(|b| b.name == "feature/new-branch")
            .is_none());
        assert!(branches
            .iter()
            .find(|b| b.name == "feature/renamed-branch")
            .is_some());

        // 3. Delete branch
        delete_branch(
            app,
            path.clone(),
            "feature/renamed-branch".to_string(),
            false,
        )
        .await
        .unwrap();

        let branches = list_branches(path.clone()).await.unwrap();
        assert!(branches
            .iter()
            .find(|b| b.name == "feature/renamed-branch")
            .is_none());
    }

    #[tokio::test]
    async fn test_list_merged_branches() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        let path = repo.path_str().to_string();
        create_branch(path.clone(), "merged-feature".to_string(), None)
            .await
            .unwrap();

        // Advance main commit
        repo.write_file("test.txt", "hello world");
        repo.commit("second commit");

        let merged = list_merged_branches(path, None).await.unwrap();
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].name, "merged-feature");
    }
}
