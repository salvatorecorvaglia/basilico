use crate::git::repository;

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<repository::TagInfo>, String> {
    repository::list_tags(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    repo.tag_delete(&name).map_err(|e| e.to_string())?;
    Ok(())
}

