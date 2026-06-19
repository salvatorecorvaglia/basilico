/* ═══════════════════════════════════════════════════════
Basilico — Worktree Commands
Command handlers for git worktree operations
═══════════════════════════════════════════════════════ */

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub name: String,
    pub head: String,
    pub branch: Option<String>,
}

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = crate::commands::new_command("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
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
}

#[tauri::command]
pub async fn add_worktree(
    repo_path: String,
    path: String,
    branch: Option<String>,
    new_branch: Option<String>,
) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

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
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];

    if force {
        args.push("--force");
    }

    args.push(&worktree_path);

    let output = crate::commands::new_command("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn prune_worktrees(repo_path: String) -> Result<(), String> {
    let output = crate::commands::new_command("git")
        .args(["worktree", "prune"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree prune: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}
