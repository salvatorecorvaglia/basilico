use crate::error::AppError;
use git2::{build::CheckoutBuilder, ApplyLocation, ApplyOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let mut index = repo.index()?;
    for file in files {
        index.add_path(Path::new(&file))?;
    }
    index.write()?;
    Ok(())
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let head = repo.head();
    match head {
        Ok(head_ref) => {
            let commit = head_ref.peel_to_commit()?;
            repo.reset_default(Some(commit.as_object()), &files)?;
        }
        Err(_) => {
            // Empty repo: remove from index
            let mut index = repo.index()?;
            for file in files {
                let _ = index.remove_path(Path::new(&file));
            }
            index.write()?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_patch(path: String, patch: String, location: String) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let diff = git2::Diff::from_buffer(patch.as_bytes())?;
    let mut apply_opts = ApplyOptions::new();

    let apply_loc = match location.as_str() {
        "index" => ApplyLocation::Index,
        "workdir" => ApplyLocation::WorkDir,
        "both" => ApplyLocation::Both,
        _ => return Err(AppError::invalid_state("Invalid apply location")),
    };

    repo.apply(&diff, apply_loc, Some(&mut apply_opts))?;
    Ok(())
}

#[tauri::command]
pub async fn discard_changes(path: String, files: Vec<String>) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let index = repo.index()?;
    let repo_dir = Path::new(&path);

    let mut tracked_files = Vec::new();
    let mut untracked_files = Vec::new();

    for file in &files {
        let file_path = Path::new(file);
        if index.get_path(file_path, 0).is_some() {
            tracked_files.push(file);
        } else {
            untracked_files.push(file);
        }
    }

    // 1. Discard changes in tracked files
    if !tracked_files.is_empty() {
        let mut opts = CheckoutBuilder::new();
        opts.force();
        for file in &tracked_files {
            opts.path(Path::new(file));
        }
        repo.checkout_index(None, Some(&mut opts))?;
    }

    // 2. Delete untracked files from disk
    for file in untracked_files {
        let full_path = repo_dir.join(file);
        if full_path.exists() {
            if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path)?;
            } else {
                std::fs::remove_file(&full_path)?;
            }
        }
    }

    Ok(())
}
