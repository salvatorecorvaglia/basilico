use crate::git::repository;

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<repository::TagInfo>, String> {
    repository::list_tags(&path).map_err(|e| e.message)
}
