/* ═══════════════════════════════════════════════════════
Basilico — Bisect Commands
Command handlers for git bisect operations
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use git2::Repository;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BisectState {
    pub is_bisecting: bool,
    pub message: String,
    pub current_oid: Option<String>,
    pub steps_remaining: Option<usize>,
}

fn run_git_cmd(repo_path: &str, args: &[&str]) -> Result<String, AppError> {
    let output = crate::commands::new_command("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| AppError::command(format!("Failed to execute git command: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(AppError::git(if stderr.is_empty() { stdout } else { stderr }))
    }
}

fn get_bisect_state(repo_path: &str, last_output: String) -> BisectState {
    let repo = Repository::open(repo_path).ok();
    let is_bisecting = repo
        .map(|r| r.state() == git2::RepositoryState::Bisect)
        .unwrap_or(false);

    let current_oid = if is_bisecting {
        run_git_cmd(repo_path, &["rev-parse", "HEAD"]).ok()
    } else {
        None
    };

    let steps_remaining = if last_output.contains("roughly") {
        last_output
            .split("roughly ")
            .nth(1)
            .and_then(|s| s.split(" step").next())
            .and_then(|s| s.parse::<usize>().ok())
    } else {
        None
    };

    BisectState {
        is_bisecting,
        message: last_output,
        current_oid,
        steps_remaining,
    }
}

#[tauri::command]
pub async fn bisect_start(
    repo_path: String,
    bad: String,
    good: String,
) -> Result<BisectState, AppError> {
    // First run reset to clear any stale bisect state
    let _ = run_git_cmd(&repo_path, &["bisect", "reset"]);

    let output = run_git_cmd(&repo_path, &["bisect", "start", &bad, &good])?;
    Ok(get_bisect_state(&repo_path, output))
}

#[tauri::command]
pub async fn bisect_mark(
    repo_path: String,
    status: String, // "good", "bad", "skip"
) -> Result<BisectState, AppError> {
    let output = run_git_cmd(&repo_path, &["bisect", &status])?;
    Ok(get_bisect_state(&repo_path, output))
}

#[tauri::command]
pub async fn bisect_reset(repo_path: String) -> Result<(), AppError> {
    run_git_cmd(&repo_path, &["bisect", "reset"])?;
    Ok(())
}
