/* ═══════════════════════════════════════════════════════
Basilico — Submodule Commands
Command handlers for git submodule operations
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use git2::Repository;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: Option<String>,
    pub head_oid: Option<String>,
    pub status: String, // "initialized", "uninitialized", "dirty", "up-to-date"
}

#[tauri::command]
pub async fn list_submodules(repo_path: String) -> Result<Vec<SubmoduleInfo>, AppError> {
    let repo = Repository::open(&repo_path)?;
    let submodules = repo.submodules()?;

    let mut result = Vec::new();

    for sm in &submodules {
        let name = sm.name().unwrap_or("").to_string();
        let path = sm.path().to_string_lossy().to_string();
        let url = sm.url().map(|u| u.to_string());
        let head_oid = sm.head_id().map(|id| id.to_string());

        // Determine status based on submodule state
        let status = match sm.open() {
            Ok(sub_repo) => {
                // Check if the workdir has modifications
                let statuses = sub_repo.statuses(None);
                match statuses {
                    Ok(s) if s.len() > 0 => "dirty".to_string(),
                    Ok(_) => "up-to-date".to_string(),
                    Err(_) => "initialized".to_string(),
                }
            }
            Err(_) => {
                // Can't open the submodule repo — likely not initialized
                "uninitialized".to_string()
            }
        };

        result.push(SubmoduleInfo {
            name,
            path,
            url,
            head_oid,
            status,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn init_submodules(repo_path: String, paths: Vec<String>) -> Result<(), AppError> {
    let mut args = vec!["submodule".to_string(), "init".to_string()];

    if !paths.is_empty() {
        args.push("--".to_string());
        args.extend(paths);
    }

    let output = crate::commands::new_command("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git submodule init: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::submodule(String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn update_submodules(
    repo_path: String,
    paths: Vec<String>,
    recursive: bool,
) -> Result<(), AppError> {
    let mut args = vec![
        "submodule".to_string(),
        "update".to_string(),
        "--init".to_string(),
    ];

    if recursive {
        args.push("--recursive".to_string());
    }

    if !paths.is_empty() {
        args.push("--".to_string());
        args.extend(paths);
    }

    let output = crate::commands::new_command("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git submodule update: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::submodule(String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn sync_submodules(repo_path: String, paths: Vec<String>) -> Result<(), AppError> {
    let mut args = vec!["submodule".to_string(), "sync".to_string()];

    if !paths.is_empty() {
        args.push("--".to_string());
        args.extend(paths);
    }

    let output = crate::commands::new_command("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git submodule sync: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::submodule(String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn add_submodule(repo_path: String, url: String, path: String) -> Result<(), AppError> {
    let output = crate::commands::new_command("git")
        .args(["submodule", "add", &url, &path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git submodule add: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::submodule(String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}
