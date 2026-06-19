use crate::error::AppError;
use crate::git::repository;
use git2::Repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, AppError> {
    repository::list_branches(&path)
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), AppError> {
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
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, is_remote: bool) -> Result<(), AppError> {
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
}

#[tauri::command]
pub async fn checkout_branch(path: String, name: String) -> Result<(), AppError> {
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
    let ref_name = if name.contains('/') && !name.starts_with("refs/") {
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
}

#[tauri::command]
pub async fn rename_branch(
    path: String,
    current_name: String,
    new_name: String,
) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut branch = repo.find_branch(&current_name, git2::BranchType::Local)?;
    branch.rename(&new_name, false)?;
    Ok(())
}
