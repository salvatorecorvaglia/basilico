use git2::{build::CheckoutBuilder, ApplyLocation, ApplyOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    for file in files {
        index
            .add_path(Path::new(&file))
            .map_err(|e| e.to_string())?;
    }
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let head = repo.head();
    match head {
        Ok(head_ref) => {
            let commit = head_ref.peel_to_commit().map_err(|e| e.to_string())?;
            repo.reset_default(Some(commit.as_object()), &files)
                .map_err(|e| e.to_string())?;
        }
        Err(_) => {
            // Empty repo: remove from index
            let mut index = repo.index().map_err(|e| e.to_string())?;
            for file in files {
                let _ = index.remove_path(Path::new(&file));
            }
            index.write().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_patch(path: String, patch: String, location: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let diff = git2::Diff::from_buffer(patch.as_bytes()).map_err(|e| e.to_string())?;
    let mut apply_opts = ApplyOptions::new();

    let apply_loc = match location.as_str() {
        "index" => ApplyLocation::Index,
        "workdir" => ApplyLocation::WorkDir,
        "both" => ApplyLocation::Both,
        _ => return Err("Invalid apply location".to_string()),
    };

    repo.apply(&diff, apply_loc, Some(&mut apply_opts))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn discard_changes(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let index = repo.index().map_err(|e| e.to_string())?;
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
        repo.checkout_index(None, Some(&mut opts))
            .map_err(|e| e.to_string())?;
    }

    // 2. Delete untracked files from disk
    for file in untracked_files {
        let full_path = repo_dir.join(file);
        if full_path.exists() {
            if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
