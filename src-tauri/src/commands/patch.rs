/* ═══════════════════════════════════════════════════════
Basilico — Patch Commands
Patch generation and unified diff formatting
═══════════════════════════════════════════════════════ */

use crate::error::AppError;

#[tauri::command]
pub async fn create_commit_patch(
    repo_path: String,
    commit_oid: String,
) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let output = crate::commands::new_command("git")
            .args(["format-patch", "-1", "--stdout", &commit_oid])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git format-patch: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::git(format!("format-patch error: {}", stderr)));
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
    tokio::task::spawn_blocking(move || {
        let revision_range = format!("{}..{}", from_oid, to_oid);
        let output = crate::commands::new_command("git")
            .args(["format-patch", "--stdout", &revision_range])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| AppError::command(format!("Failed to run git format-patch: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::git(format!(
                "format-patch range error: {}",
                stderr
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    })
    .await?
}
