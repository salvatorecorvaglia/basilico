use crate::git::repository;
use git2::Repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, String> {
    repository::list_branches(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let target = match start_point {
        Some(ref s) => {
            let obj = repo.revparse_single(s).map_err(|e| e.to_string())?;
            obj.as_commit()
                .ok_or_else(|| "Start point is not a commit".to_string())?
                .clone()
        }
        None => {
            let head = repo.head().map_err(|e| e.to_string())?;
            head.peel_to_commit().map_err(|e| e.to_string())?
        }
    };

    repo.branch(&name, &target, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, is_remote: bool) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    if is_remote {
        let ref_name = format!("refs/remotes/{}", name);
        let mut reference = repo.find_reference(&ref_name).map_err(|e| e.to_string())?;
        reference.delete().map_err(|e| e.to_string())?;
    } else {
        let mut branch = repo
            .find_branch(&name, git2::BranchType::Local)
            .map_err(|e| e.to_string())?;
        branch.delete().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn checkout_branch(path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    let ref_name = if name.contains('/') && !name.starts_with("refs/") {
        // Handle remote branches: "origin/feature" -> checkout local tracking branch "feature"
        let parts: Vec<&str> = name.splitn(2, '/').collect();
        if parts.len() == 2 {
            let local_name = parts[1];
            if let Ok(local_branch) = repo.find_branch(local_name, git2::BranchType::Local) {
                local_branch
                    .get()
                    .name()
                    .unwrap_or("")
                    .to_string()
            } else {
                let remote_ref = format!("refs/remotes/{}", name);
                let remote_reference = repo.find_reference(&remote_ref).map_err(|e| e.to_string())?;
                let commit = remote_reference.peel_to_commit().map_err(|e| e.to_string())?;
                let mut new_branch = repo
                    .branch(local_name, &commit, false)
                    .map_err(|e| e.to_string())?;
                new_branch.set_upstream(Some(&name)).ok();
                new_branch
                    .get()
                    .name()
                    .unwrap_or("")
                    .to_string()
            }
        } else {
            format!("refs/heads/{}", name)
        }
    } else if name.starts_with("refs/") {
        name.clone()
    } else {
        format!("refs/heads/{}", name)
    };

    let obj = repo.revparse_single(&ref_name).map_err(|e| e.to_string())?;
    let mut opts = git2::build::CheckoutBuilder::new();
    opts.safe(); // Prevents checkout if it overwrites local dirty changes
    repo.checkout_tree(&obj, Some(&mut opts))
        .map_err(|e| e.to_string())?;

    repo.set_head(&ref_name).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_branch(
    path: String,
    current_name: String,
    new_name: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut branch = repo
        .find_branch(&current_name, git2::BranchType::Local)
        .map_err(|e| e.to_string())?;
    branch.rename(&new_name, false).map_err(|e| e.to_string())?;
    Ok(())
}
