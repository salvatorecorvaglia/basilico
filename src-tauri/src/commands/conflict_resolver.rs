use git2::Repository;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct ConflictStages {
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
}

#[tauri::command]
pub async fn get_conflict_stages(
    repo_path: String,
    file_path: String,
) -> Result<ConflictStages, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let index = repo.index().map_err(|e| e.to_string())?;

    let mut base = None;
    let mut ours = None;
    let mut theirs = None;

    let conflicts = index.conflicts().map_err(|e| e.to_string())?;
    for conflict_res in conflicts {
        let conflict = conflict_res.map_err(|e| e.to_string())?;

        let path_matched = match &conflict.our {
            Some(entry) => String::from_utf8_lossy(&entry.path) == file_path,
            None => match &conflict.their {
                Some(entry) => String::from_utf8_lossy(&entry.path) == file_path,
                None => match &conflict.ancestor {
                    Some(entry) => String::from_utf8_lossy(&entry.path) == file_path,
                    None => false,
                },
            },
        };

        if path_matched {
            if let Some(entry) = conflict.ancestor {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    base = Some(String::from_utf8_lossy(blob.content()).into_owned());
                }
            }
            if let Some(entry) = conflict.our {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    ours = Some(String::from_utf8_lossy(blob.content()).into_owned());
                }
            }
            if let Some(entry) = conflict.their {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    theirs = Some(String::from_utf8_lossy(blob.content()).into_owned());
                }
            }
            break;
        }
    }

    Ok(ConflictStages { base, ours, theirs })
}

#[tauri::command]
pub async fn save_merged_resolution(
    repo_path: String,
    file_path: String,
    merged_content: String,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

    let full_path = Path::new(&repo_path).join(&file_path);
    fs::write(&full_path, merged_content).map_err(|e| e.to_string())?;

    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_path(Path::new(&file_path))
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;

    Ok(())
}
