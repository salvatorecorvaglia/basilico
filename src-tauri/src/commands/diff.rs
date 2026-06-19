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
    is_staged: bool,
) -> Result<diff_parser::FileDiff, String> {
    diff_parser::get_file_diff(&path, &file_path, is_staged).map_err(|e| e.message)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentPair {
    pub original: String,
    pub modified: String,
}

#[tauri::command]
pub async fn get_file_content_pair(
    path: String,
    file_path: String,
    is_staged: bool,
) -> Result<FileContentPair, String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;

    let mut original = String::new();
    let mut modified = String::new();

    if is_staged {
        // Original: from HEAD commit
        if let Ok(head_ref) = repo.head() {
            if let Ok(commit) = head_ref.peel_to_commit() {
                if let Ok(tree) = commit.tree() {
                    if let Ok(entry) = tree.get_path(std::path::Path::new(&file_path)) {
                        if let Ok(blob) = repo.find_blob(entry.id()) {
                            original = String::from_utf8_lossy(blob.content()).to_string();
                        }
                    }
                }
            }
        }

        // Modified: from Index
        if let Ok(index) = repo.index() {
            if let Some(entry) = index.get_path(std::path::Path::new(&file_path), 0) {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    modified = String::from_utf8_lossy(blob.content()).to_string();
                }
            }
        }
    } else {
        // Original: from Index (fallback to HEAD if not in index)
        let mut found_original = false;
        if let Ok(index) = repo.index() {
            if let Some(entry) = index.get_path(std::path::Path::new(&file_path), 0) {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    original = String::from_utf8_lossy(blob.content()).to_string();
                    found_original = true;
                }
            }
        }
        if !found_original {
            if let Ok(head_ref) = repo.head() {
                if let Ok(commit) = head_ref.peel_to_commit() {
                    if let Ok(tree) = commit.tree() {
                        if let Ok(entry) = tree.get_path(std::path::Path::new(&file_path)) {
                            if let Ok(blob) = repo.find_blob(entry.id()) {
                                original = String::from_utf8_lossy(blob.content()).to_string();
                            }
                        }
                    }
                }
            }
        }

        // Modified: from Working Directory
        if let Some(workdir) = repo.workdir() {
            let full_path = workdir.join(&file_path);
            if full_path.exists() && full_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(full_path) {
                    modified = content;
                }
            }
        }
    }

    Ok(FileContentPair { original, modified })
}

#[tauri::command]
pub async fn get_file_content_at_revision(
    path: String,
    file_path: String,
    revision: String,
) -> Result<String, String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    
    // Resolve revision spec (like commit SHA or SHA^)
    let obj = repo.revparse_single(&revision).map_err(|e| e.to_string())?;
    
    let blob = if let Some(commit) = obj.as_commit() {
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let entry = tree.get_path(std::path::Path::new(&file_path)).map_err(|e| e.to_string())?;
        let object = entry.to_object(&repo).map_err(|e| e.to_string())?;
        object.into_blob().map_err(|_| "Object is not a blob".to_string())?
    } else if let Some(tree) = obj.as_tree() {
        let entry = tree.get_path(std::path::Path::new(&file_path)).map_err(|e| e.to_string())?;
        let object = entry.to_object(&repo).map_err(|e| e.to_string())?;
        object.into_blob().map_err(|_| "Object is not a blob".to_string())?
    } else if let Some(blob) = obj.as_blob() {
        blob.clone()
    } else {
        return Err("Unable to resolve object to a blob".to_string());
    };

    Ok(String::from_utf8_lossy(blob.content()).to_string())
}

#[tauri::command]
pub async fn get_compare_diff(
    path: String,
    base: String,
    target: String,
) -> Result<Vec<diff_parser::FileDiff>, String> {
    diff_parser::get_compare_diff(&path, &base, &target).map_err(|e| e.message)
}

#[tauri::command]
pub async fn get_file_content_pair_revisions(
    path: String,
    file_path: String,
    base: String,
    target: String,
) -> Result<FileContentPair, String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    
    let mut original = String::new();
    let mut modified = String::new();
    
    // Resolve base revision spec
    if let Ok(base_obj) = repo.revparse_single(&base) {
        if let Ok(tree) = base_obj.peel_to_tree() {
            if let Ok(entry) = tree.get_path(std::path::Path::new(&file_path)) {
                if let Ok(blob) = repo.find_blob(entry.id()) {
                    original = String::from_utf8_lossy(blob.content()).to_string();
                }
            }
        }
    }
    
    // Resolve target revision spec
    if let Ok(target_obj) = repo.revparse_single(&target) {
        if let Ok(tree) = target_obj.peel_to_tree() {
            if let Ok(entry) = tree.get_path(std::path::Path::new(&file_path)) {
                if let Ok(blob) = repo.find_blob(entry.id()) {
                    modified = String::from_utf8_lossy(blob.content()).to_string();
                }
            }
        }
    }
    
    Ok(FileContentPair { original, modified })
}

