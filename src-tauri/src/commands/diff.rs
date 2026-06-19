use crate::git::diff_parser;

#[tauri::command]
pub async fn get_workdir_diff(path: String) -> Result<Vec<diff_parser::FileDiff>, String> {
    diff_parser::get_workdir_diff(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn get_staged_diff(path: String) -> Result<Vec<diff_parser::FileDiff>, String> {
    diff_parser::get_staged_diff(&path).map_err(|e| e.message)
}

#[tauri::command]
pub async fn get_commit_diff(
    path: String,
    oid: String,
) -> Result<Vec<diff_parser::FileDiff>, String> {
    diff_parser::get_commit_diff(&path, &oid).map_err(|e| e.message)
}

#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
) -> Result<diff_parser::FileDiff, String> {
    diff_parser::get_file_diff(&path, &file_path).map_err(|e| e.message)
}
