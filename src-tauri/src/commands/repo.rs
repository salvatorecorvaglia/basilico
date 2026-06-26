use crate::error::AppError;
use crate::git::repository;
use crate::state::AppState;

#[tauri::command]
pub async fn open_repo(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<repository::RepoInfo, AppError> {
    let info = tokio::task::spawn_blocking(move || repository::open_repo(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))??;

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
    let canonical = std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path);
    state.remove_repo(&canonical);
    Ok(())
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<repository::RepoStatus, AppError> {
    tokio::task::spawn_blocking(move || repository::get_status(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn list_remotes(path: String) -> Result<Vec<repository::RemoteInfo>, AppError> {
    tokio::task::spawn_blocking(move || repository::list_remotes(&path))
        .await
        .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}
