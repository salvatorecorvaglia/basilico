use crate::error::AppError;
use crate::git::repository;
use crate::state::AppState;

#[tauri::command]
pub async fn open_repo(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<repository::RepoInfo, AppError> {
    let info = repository::open_repo(&path)?;

    // Only register and start watcher if it's not already tracked
    if !state.has_repo(&info.path) {
        let watcher_id = uuid::Uuid::new_v4().to_string();
        state.add_repo(info.path.clone(), watcher_id.clone());
        crate::watcher::start_watching(app, info.path.clone(), watcher_id);
    }

    Ok(info)
}

#[tauri::command]
pub async fn close_repo(path: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    state.remove_repo(&path);
    Ok(())
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<repository::RepoStatus, AppError> {
    repository::get_status(&path)
}

#[tauri::command]
pub async fn list_remotes(path: String) -> Result<Vec<repository::RemoteInfo>, AppError> {
    repository::list_remotes(&path)
}

#[tauri::command]
pub async fn clean_repository(
    path: String,
    dry_run: bool,
    clean_dirs: bool,
    include_ignored: bool,
) -> Result<Vec<String>, AppError> {
    let mut args = vec!["clean"];

    if dry_run {
        args.push("-n");
    } else {
        args.push("-f");
    }

    if clean_dirs {
        args.push("-d");
    }

    if include_ignored {
        args.push("-x");
    }

    let output = crate::commands::new_command("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git clean: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut cleaned_paths = Vec::new();

    for line in stdout.lines() {
        if let Some(stripped) = line.strip_prefix("Would remove ") {
            cleaned_paths.push(stripped.trim().to_string());
        } else if let Some(stripped) = line.strip_prefix("Removing ") {
            cleaned_paths.push(stripped.trim().to_string());
        }
    }

    if output.status.success() {
        Ok(cleaned_paths)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::git(format!("Git clean failed: {}", stderr)))
    }
}
