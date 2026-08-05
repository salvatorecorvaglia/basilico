/* ═══════════════════════════════════════════════════════
Basilico — Worktree Commands
Command handlers for git worktree operations
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

/// Resolve `.` and `..` lexically, without requiring the path to exist.
///
/// `std::fs::canonicalize` cannot be used here: the worktree directory is being
/// created, so it does not exist yet.
pub fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub name: String,
    pub head: String,
    pub branch: Option<String>,
}

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let output = crate::commands::new_command("git")
            .args(["worktree", "list", "--porcelain"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git worktree list: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut worktrees = Vec::new();
        let mut current_path: Option<String> = None;
        let mut current_head = String::new();
        let mut current_branch: Option<String> = None;

        for line in stdout.lines() {
            if line.starts_with("worktree ") {
                // Save previous entry if exists
                if let Some(ref path) = current_path {
                    let name = std::path::Path::new(path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| path.clone());
                    worktrees.push(WorktreeInfo {
                        path: path.clone(),
                        name,
                        head: current_head.clone(),
                        branch: current_branch.take(),
                    });
                }
                current_path = Some(line.trim_start_matches("worktree ").to_string());
                current_head.clear();
                current_branch = None;
            } else if line.starts_with("HEAD ") {
                current_head = line.trim_start_matches("HEAD ").to_string();
            } else if line.starts_with("branch ") {
                let branch_ref = line.trim_start_matches("branch ").to_string();
                // Strip refs/heads/ prefix for display
                current_branch = Some(
                    branch_ref
                        .strip_prefix("refs/heads/")
                        .unwrap_or(&branch_ref)
                        .to_string(),
                );
            }
        }

        // Don't forget the last entry
        if let Some(ref path) = current_path {
            let name = std::path::Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            worktrees.push(WorktreeInfo {
                path: path.clone(),
                name,
                head: current_head,
                branch: current_branch,
            });
        }

        Ok(worktrees)
    })
    .await?
}

#[tauri::command]
pub async fn add_worktree(
    repo_path: String,
    path: String,
    branch: Option<String>,
    new_branch: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        // Worktrees are conventionally created *outside* the repository (a
        // sibling directory), so absolute paths and `..` are both legitimate
        // here. What must be prevented is placing one inside the working tree,
        // where git would then see it as untracked clutter.
        let repo_root = std::fs::canonicalize(&repo_path)
            .map_err(|e| AppError::io(format!("Failed to resolve repository path: {}", e)))?;

        let requested = std::path::Path::new(&path);
        let absolute = if requested.is_absolute() {
            requested.to_path_buf()
        } else {
            // Relative paths are resolved against the repository, not the
            // process working directory — git interprets them that way, and
            // creating the parent anywhere else would put it in the wrong place.
            repo_root.join(requested)
        };

        // Placing a worktree inside the working tree is allowed (git permits
        // it, and some layouts gitignore a `worktrees/` directory), but the
        // repository root itself is never a valid target.
        let normalized = normalize_path(&absolute);
        if normalized == repo_root {
            return Err(AppError::invalid_state(
                "The worktree path cannot be the repository root itself.",
            ));
        }

        if let Some(parent) = normalized.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::io(format!("Failed to create parent directory: {}", e)))?;
        }

        let path = normalized.to_string_lossy().to_string();
        let mut args = vec!["worktree".to_string(), "add".to_string()];

        if let Some(ref nb) = new_branch {
            args.push("-b".to_string());
            args.push(nb.clone());
        }

        args.push(path);

        if let Some(ref b) = branch {
            args.push(b.clone());
        }

        let output = crate::commands::new_command("git")
            .args(&args)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git worktree add: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["worktree", "remove"];

        if force {
            args.push("--force");
        }

        // "--" stops git reading a worktree path that begins with '-' as a flag.
        args.push("--");
        args.push(&worktree_path);

        let output = crate::commands::new_command("git")
            .args(&args)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git worktree remove: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn prune_worktrees(repo_path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let output = crate::commands::new_command("git")
            .args(["worktree", "prune"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git worktree prune: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn lock_worktree(
    repo_path: String,
    worktree_name: String,
    reason: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["worktree".to_string(), "lock".to_string()];

        if let Some(ref r) = reason {
            args.push("--reason".to_string());
            args.push(r.clone());
        }

        args.push("--".to_string());
        args.push(worktree_name);

        let output = crate::commands::new_command("git")
            .args(&args)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to lock worktree: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn unlock_worktree(repo_path: String, worktree_name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let output = crate::commands::new_command("git")
            .args(["worktree", "unlock", "--", &worktree_name])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to unlock worktree: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::git(String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    })
    .await?
}
