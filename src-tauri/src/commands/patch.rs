/* ═══════════════════════════════════════════════════════
Basilico — Patch Commands
Patch generation and unified diff formatting
═══════════════════════════════════════════════════════ */

use crate::error::AppError;

/// Reject revision strings git would read as options.
///
/// `format-patch` accepts flags such as `--output-directory`, so a revision
/// beginning with `-` must never reach it positionally.
fn validate_revision(rev: &str) -> Result<(), AppError> {
    crate::commands::validate_git_argument(rev, "Revision")
}

#[tauri::command]
pub async fn create_commit_patch(
    repo_path: String,
    commit_oid: String,
) -> Result<String, AppError> {
    validate_revision(&commit_oid)?;
    tokio::task::spawn_blocking(move || {
        // `git_output` rather than `run_git_cmd`: a patch's exact bytes matter,
        // including the trailing newline `run_git_cmd` trims. This is the split
        // the helper's own docs point callers to.
        let args = ["format-patch", "-1", "--stdout", &commit_oid, "--"];
        let output = crate::commands::git_output(&args, &repo_path)?;

        if !output.status.success() {
            return Err(AppError::git(crate::commands::git_failure_message(
                &args, &output,
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    })
    .await?
}

#[tauri::command]
pub async fn create_range_patch(
    repo_path: String,
    from_oid: String,
    to_oid: String,
) -> Result<String, AppError> {
    validate_revision(&from_oid)?;
    validate_revision(&to_oid)?;
    tokio::task::spawn_blocking(move || {
        let revision_range = format!("{}..{}", from_oid, to_oid);
        let args = ["format-patch", "--stdout", &revision_range, "--"];
        let output = crate::commands::git_output(&args, &repo_path)?;

        if !output.status.success() {
            return Err(AppError::git(crate::commands::git_failure_message(
                &args, &output,
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    })
    .await?
}
