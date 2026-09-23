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

/// Bisect reports progress on stdout *or* stderr depending on the subcommand,
/// so success needs whichever one carried the message.
///
/// Deliberately distinct from [`crate::commands::run_git_cmd`], which returns
/// stdout only. Named apart from it so the two cannot be confused: this one
/// used to shadow the shared helper, which made the shared one look used when
/// it in fact had no callers at all.
fn run_bisect_cmd(repo_path: &str, args: &[&str]) -> Result<String, AppError> {
    let output = crate::commands::git_output(args, repo_path)?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(AppError::git(crate::commands::git_failure_message(
            args, &output,
        )))
    }
}

fn get_bisect_state(repo_path: &str, last_output: String) -> BisectState {
    let repo = Repository::open(repo_path).ok();
    let is_bisecting = repo
        .map(|r| r.state() == git2::RepositoryState::Bisect)
        .unwrap_or(false);

    let current_oid = if is_bisecting {
        run_bisect_cmd(repo_path, &["rev-parse", "HEAD"]).ok()
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
    crate::commands::validate_git_argument(&bad, "Bisect revision")?;
    crate::commands::validate_git_argument(&good, "Bisect revision")?;
    tokio::task::spawn_blocking(move || {
        // Refuse rather than silently discarding an in-progress bisect: the
        // reset would check out the original branch and throw away the search
        // the user had already narrowed down.
        let repo = Repository::open(&repo_path)?;
        if repo.state() == git2::RepositoryState::Bisect {
            return Err(AppError::invalid_state(
                "A bisect session is already in progress. Finish or reset it before starting a new one.",
            ));
        }

        let output = run_bisect_cmd(&repo_path, &["bisect", "start", &bad, &good])?;
        Ok(get_bisect_state(&repo_path, output))
    })
    .await?
}

#[tauri::command]
pub async fn bisect_mark(
    repo_path: String,
    status: String, // "good", "bad", "skip"
) -> Result<BisectState, AppError> {
    if status != "good" && status != "bad" && status != "skip" {
        return Err(AppError::invalid_state("Invalid bisect status"));
    }
    tokio::task::spawn_blocking(move || {
        let output = run_bisect_cmd(&repo_path, &["bisect", &status])?;
        Ok(get_bisect_state(&repo_path, output))
    })
    .await?
}

#[tauri::command]
pub async fn bisect_reset(repo_path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        run_bisect_cmd(&repo_path, &["bisect", "reset"])?;
        Ok(())
    })
    .await?
}
