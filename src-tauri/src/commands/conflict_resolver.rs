use crate::error::AppError;
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
) -> Result<ConflictStages, AppError> {
    let repo = Repository::open(&repo_path)?;
    let index = repo.index()?;

    let mut base = None;
    let mut ours = None;
    let mut theirs = None;

    let conflicts = index.conflicts()?;
    for conflict_res in conflicts {
        let conflict = conflict_res?;

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
) -> Result<(), AppError> {
    let repo = Repository::open(&repo_path)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
    let validated_full_path = crate::git::utils::validate_path(workdir, Path::new(&file_path))?;

    fs::write(&validated_full_path, merged_content)?;

    let mut index = repo.index()?;
    index.add_path(Path::new(&file_path))?;
    index.write()?;

    Ok(())
}
