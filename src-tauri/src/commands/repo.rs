use crate::git::repository;
use crate::state::AppState;

#[tauri::command]
pub async fn open_repo(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<repository::RepoInfo, String> {
    let info = repository::open_repo(&path).map_err(|e| e.message)?;
    
    // Only register and start watcher if it's not already tracked
    if !state.has_repo(&info.path) {
        state.add_repo(info.path.clone());
        crate::watcher::start_watching(app, info.path.clone());
    }
    
    Ok(info)
}

#[tauri::command]
pub async fn close_repo(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.remove_repo(&path);
    Ok(())
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<repository::RepoStatus, String> {
    repository::get_status(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn list_remotes(path: String) -> Result<Vec<repository::RemoteInfo>, String> {
    repository::list_remotes(&path).map_err(|e| e.message)
}
