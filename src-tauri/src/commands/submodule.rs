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
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let submodules = repo.submodules()?;

        let mut result = Vec::new();

        for sm in &submodules {
            let name = sm.name().unwrap_or("").to_string();
            let path = sm.path().to_string_lossy().to_string();
            let url = sm.url().map(|u| u.to_string());
            let head_oid = sm.head_id().map(|id| id.to_string());

            // Determine status based on submodule state
            let status = match repo.submodule_status(&path, git2::SubmoduleIgnore::None) {
                Ok(s) => {
                    if s.contains(git2::SubmoduleStatus::WD_UNINITIALIZED) {
                        "uninitialized".to_string()
                    } else if s.contains(git2::SubmoduleStatus::WD_MODIFIED)
                        || s.contains(git2::SubmoduleStatus::WD_WD_MODIFIED)
                        || s.contains(git2::SubmoduleStatus::WD_INDEX_MODIFIED)
                    {
                        "dirty".to_string()
                    } else {
                        "up-to-date".to_string()
                    }
                }
                Err(_) => "uninitialized".to_string(),
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
    })
    .await?
}

#[tauri::command]
pub async fn init_submodules(repo_path: String, paths: Vec<String>) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["submodule".to_string(), "init".to_string()];

        if !paths.is_empty() {
            args.push("--".to_string());
            args.extend(paths);
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = crate::commands::git_output(arg_refs.as_slice(), &repo_path)?;
        if !output.status.success() {
            return Err(AppError::submodule(crate::commands::git_failure_message(
                arg_refs.as_slice(),
                &output,
            )));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn update_submodules(
    repo_path: String,
    paths: Vec<String>,
    recursive: bool,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
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

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = crate::commands::git_output(arg_refs.as_slice(), &repo_path)?;
        if !output.status.success() {
            return Err(AppError::submodule(crate::commands::git_failure_message(
                arg_refs.as_slice(),
                &output,
            )));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn sync_submodules(repo_path: String, paths: Vec<String>) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["submodule".to_string(), "sync".to_string()];

        if !paths.is_empty() {
            args.push("--".to_string());
            args.extend(paths);
        }

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = crate::commands::git_output(arg_refs.as_slice(), &repo_path)?;
        if !output.status.success() {
            return Err(AppError::submodule(crate::commands::git_failure_message(
                arg_refs.as_slice(),
                &output,
            )));
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn add_submodule(repo_path: String, url: String, path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;

        // Validate path traversal
        let _ = crate::git::utils::validate_path(workdir, std::path::Path::new(&path))?;

        // `submodule add` delegates to `git clone`, which honours flags such as
        // `--upload-pack=<cmd>`. Reject option-shaped values and stop argument
        // parsing with `--`, as the sibling submodule commands already do.
        crate::commands::validate_git_argument(&url, "Submodule URL")?;

        let output =
            crate::commands::git_output(&["submodule", "add", "--", &url, &path], &repo_path)?;
        if !output.status.success() {
            return Err(AppError::submodule(crate::commands::git_failure_message(
                &["submodule", "add", "--", &url, &path],
                &output,
            )));
        }

        Ok(())
    })
    .await?
}
