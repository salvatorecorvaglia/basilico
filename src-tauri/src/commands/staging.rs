use crate::error::AppError;
use git2::{build::CheckoutBuilder, ApplyLocation, ApplyOptions, Repository};
use std::path::Path;

#[tauri::command]
pub async fn stage_files(path: String, files: Vec<String>) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let mut index = repo.index()?;
        for file in files {
            let validated_full_path = crate::git::utils::validate_path(workdir, Path::new(&file))?;
            // symlink_metadata, not `exists()`: a broken symlink is still a
            // file that should be staged, but `exists()` follows the link and
            // reports false, which would stage a deletion instead.
            if std::fs::symlink_metadata(&validated_full_path).is_ok() {
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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        for file in &files {
            let _ = crate::git::utils::validate_path(workdir, Path::new(file))?;
        }
        let files = with_rename_sources(&repo, files)?;
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

/// `files` plus the old path of every staged rename whose new path is listed.
///
/// Status reports a staged rename under its new path. Resetting only that path
/// unstaged the addition but left the old path's deletion staged, so
/// "unstage" turned a rename into a half-staged delete.
fn with_rename_sources(repo: &Repository, mut files: Vec<String>) -> Result<Vec<String>, AppError> {
    let Ok(head_tree) = repo.head().and_then(|h| h.peel_to_tree()) else {
        return Ok(files);
    };

    let mut diff = repo.diff_tree_to_index(Some(&head_tree), None, None)?;
    let mut find_opts = git2::DiffFindOptions::new();
    find_opts.renames(true);
    diff.find_similar(Some(&mut find_opts))?;

    let wanted: std::collections::HashSet<String> = files
        .iter()
        .map(|f| crate::commands::conflict_resolver::normalize_git_path(f))
        .collect();

    let mut sources = Vec::new();
    for delta in diff.deltas() {
        if delta.status() != git2::Delta::Renamed {
            continue;
        }
        if let (Some(new_path), Some(old_path)) = (delta.new_file().path(), delta.old_file().path())
        {
            if wanted.contains(new_path.to_string_lossy().as_ref()) {
                sources.push(old_path.to_string_lossy().into_owned());
            }
        }
    }

    for source in sources {
        if !files.contains(&source) {
            files.push(source);
        }
    }
    Ok(files)
}

#[tauri::command]
pub async fn apply_patch(path: String, patch: String, location: String) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let diff = git2::Diff::from_buffer(patch.as_bytes())?;

        // Validate all file paths in the patch to prevent directory traversal.
        // `/dev/null` is the placeholder side of a file creation or deletion
        // (staging lines of an untracked file), not a path to validate.
        let is_placeholder = |p: &Path| p == Path::new("/dev/null");
        for delta in diff.deltas() {
            if let Some(old_path) = delta.old_file().path().filter(|p| !is_placeholder(p)) {
                crate::git::utils::validate_path(workdir, old_path)?;
            }
            if let Some(new_path) = delta.new_file().path().filter(|p| !is_placeholder(p)) {
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
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let index = repo.index()?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;

        // A conflicted path has only stage 1–3 entries, no stage 0, so the
        // tracked/untracked test below would call it untracked and delete it
        // from disk. Discarding is the wrong tool for a conflict anyway: the
        // user has to pick a side or merge, so refuse and say so.
        let conflicted: std::collections::HashSet<String> = index
            .conflicts()?
            .flatten()
            .filter_map(|c| c.our.or(c.their).or(c.ancestor))
            .map(|entry| {
                crate::commands::conflict_resolver::normalize_git_path(&String::from_utf8_lossy(
                    &entry.path,
                ))
            })
            .collect();

        let mut tracked_files = Vec::new();
        let mut untracked_files = Vec::new();

        for file in &files {
            let file_path = Path::new(file);
            // Validate path to prevent directory traversal
            let _validated_full_path = crate::git::utils::validate_path(workdir, file_path)?;

            let normalized_str = crate::commands::conflict_resolver::normalize_git_path(file);
            if conflicted.contains(&normalized_str) {
                // Worded to avoid the generic "merge conflict" mapping in
                // `error-messages.ts`, which would replace it with a toast that
                // no longer names the file.
                return Err(AppError::conflict(format!(
                    "'{}' is unresolved and cannot be discarded. Resolve it by \
                     choosing ours or theirs, or by editing it in the merge editor.",
                    file
                )));
            }
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
        //
        // `validate_path` is purely syntactic, so on its own it would still let
        // a symlinked *parent* redirect these deletions outside the working
        // tree: with `link -> /Users/me` in the repo, discarding
        // `link/.ssh/id_rsa` unlinked the real key. The leaf is still allowed to
        // be a symlink — `remove_file` unlinks the link, not its target, which
        // is exactly what discarding an untracked symlink should do.
        for file in untracked_files {
            let validated_full_path =
                crate::git::utils::validate_path_symlinked_leaf_ok(workdir, Path::new(file))?;
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
