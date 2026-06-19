use crate::git::repository;

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<repository::BranchInfo>, String> {
    repository::list_branches(&path).map_err(|e| e.message)
}
