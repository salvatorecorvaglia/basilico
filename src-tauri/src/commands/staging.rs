use crate::error::AppError;
use git2::{build::CheckoutBuilder, ApplyLocation, ApplyOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    let repo = Repository::open(&path)?;
    let repo_dir = Path::new(&path);
    let mut index = repo.index()?;
    for file in files {
        let full_path = repo_dir.join(&file);
        if full_path.exists() {
            index.add_path(Path::new(&file))?;
        } else {
            // File was deleted — stage the deletion
            index.remove(Path::new(&file), 0)?;
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[tokio::test]
    async fn test_stage_files_new_and_modified() {
        let repo = TempRepo::new();
        repo.write_file("file.txt", "initial contents");

        // Staging a new file
        stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
            .await
            .unwrap();

        let index = repo.repo.index().unwrap();
        assert!(index.get_path(Path::new("file.txt"), 0).is_some());
    }

    #[tokio::test]
    async fn test_stage_files_deleted() {
        let repo = TempRepo::new();
        repo.write_file("file.txt", "contents");
        repo.commit("initial");

        // Delete from worktree
        repo.remove_file("file.txt");

        // Stage the deletion
        stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
            .await
            .unwrap();

        let mut index = repo.repo.index().unwrap();
        index.read(true).unwrap();
        // File should not be present in the index after staging deletion
        assert!(index.get_path(Path::new("file.txt"), 0).is_none());
    }

    #[tokio::test]
    async fn test_unstage_files() {
        let repo = TempRepo::new();
        repo.write_file("file.txt", "contents");

        // Stage file
        stage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
            .await
            .unwrap();

        // Unstage file
        unstage_files(repo.path_str().to_string(), vec!["file.txt".to_string()])
            .await
            .unwrap();

        let index = repo.repo.index().unwrap();
        assert!(index.get_path(Path::new("file.txt"), 0).is_none());
    }

    #[tokio::test]
    async fn test_discard_changes() {
        let repo = TempRepo::new();
        repo.write_file("file.txt", "original");
        repo.commit("commit 1");

        // Modify file
        repo.write_file("file.txt", "modified");

        // Discard changes
        discard_changes(repo.path_str().to_string(), vec!["file.txt".to_string()])
            .await
            .unwrap();

        let content = std::fs::read_to_string(repo.path.join("file.txt")).unwrap();
        assert_eq!(content, "original");
    }
}

