use crate::error::AppError;
use git2::{build::CheckoutBuilder, ApplyLocation, ApplyOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let mut index = repo.index()?;
        for file in files {
            let validated_full_path = crate::git::utils::validate_path(workdir, Path::new(&file))?;
            if validated_full_path.exists() {
                index.add_path(Path::new(&file))?;
            } else {
                // File was deleted — stage the deletion
                index.remove(Path::new(&file), 0)?;
            }
        }
        index.write()?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn unstage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        for file in &files {
            let _ = crate::git::utils::validate_path(workdir, Path::new(file))?;
        }
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
    })
    .await?
}

#[tauri::command]
pub async fn apply_patch(path: String, patch: String, location: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let diff = git2::Diff::from_buffer(patch.as_bytes())?;

        // Validate all file paths in the patch to prevent directory traversal
        for delta in diff.deltas() {
            if let Some(old_path) = delta.old_file().path() {
                crate::git::utils::validate_path(workdir, old_path)?;
            }
            if let Some(new_path) = delta.new_file().path() {
                crate::git::utils::validate_path(workdir, new_path)?;
            }
        }

        let mut apply_opts = ApplyOptions::new();

        let apply_loc = match location.as_str() {
            "index" => ApplyLocation::Index,
            "workdir" => ApplyLocation::WorkDir,
            "both" => ApplyLocation::Both,
            _ => return Err(AppError::invalid_state("Invalid apply location")),
        };

        repo.apply(&diff, apply_loc, Some(&mut apply_opts))?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn discard_changes(path: String, files: Vec<String>) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let index = repo.index()?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;

        let mut tracked_files = Vec::new();
        let mut untracked_files = Vec::new();

        for file in &files {
            let file_path = Path::new(file);
            // Validate path to prevent directory traversal
            let _validated_full_path = crate::git::utils::validate_path(workdir, file_path)?;

            let normalized_str = crate::commands::conflict_resolver::normalize_git_path(file);
            let normalized_path = Path::new(&normalized_str);
            if index.get_path(normalized_path, 0).is_some()
                || index.get_path(file_path, 0).is_some()
            {
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
            let validated_full_path = crate::git::utils::validate_path(workdir, Path::new(file))?;
            if std::fs::symlink_metadata(&validated_full_path).is_ok() {
                if validated_full_path.is_dir() && !validated_full_path.is_symlink() {
                    std::fs::remove_dir_all(&validated_full_path)?;
                } else {
                    std::fs::remove_file(&validated_full_path)?;
                }
            }
        }

        Ok(())
    })
    .await?
}


