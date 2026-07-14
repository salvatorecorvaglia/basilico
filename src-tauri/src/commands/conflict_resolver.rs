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
    tokio::task::spawn_blocking(move || {
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
    })
    .await?
}

#[tauri::command]
pub async fn save_merged_resolution(
    repo_path: String,
    file_path: String,
    merged_content: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
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
    })
    .await?
}

struct TempDirGuard {
    path: std::path::PathBuf,
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

#[tauri::command]
pub async fn launch_external_merge_tool(
    repo_path: String,
    file_path: String,
    tool_name: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let index = repo.index()?;

        let mut base_content = String::new();
        let mut ours_content = String::new();
        let mut theirs_content = String::new();

        // Find conflict stages
        let conflicts = index.conflicts()?;
        let mut found = false;
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
                found = true;
                if let Some(entry) = conflict.ancestor {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        base_content = String::from_utf8_lossy(blob.content()).into_owned();
                    }
                }
                if let Some(entry) = conflict.our {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        ours_content = String::from_utf8_lossy(blob.content()).into_owned();
                    }
                }
                if let Some(entry) = conflict.their {
                    if let Ok(blob) = repo.find_blob(entry.id) {
                        theirs_content = String::from_utf8_lossy(blob.content()).into_owned();
                    }
                }
                break;
            }
        }

        if !found {
            return Err(AppError::invalid_state(format!(
                "No conflicts found for file: {}",
                file_path
            )));
        }

        let temp_dir =
            std::env::temp_dir().join(format!("basilico_merge_{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&temp_dir)?;

        let _guard = TempDirGuard {
            path: temp_dir.clone(),
        };

        // Get extension to support syntax highlighting in merge tools
        let file_ext = std::path::Path::new(&file_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("txt");

        let base_path = temp_dir.join(format!("base.{}", file_ext));
        let ours_path = temp_dir.join(format!("ours.{}", file_ext));
        let theirs_path = temp_dir.join(format!("theirs.{}", file_ext));

        std::fs::write(&base_path, &base_content)?;
        std::fs::write(&ours_path, &ours_content)?;
        std::fs::write(&theirs_path, &theirs_content)?;

        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let merged_path =
            crate::git::utils::validate_path(workdir, std::path::Path::new(&file_path))?;

        let tool_lower = tool_name.to_lowercase();
        let (program, args) = if tool_lower == "meld" {
            (
                "meld".to_string(),
                vec![
                    ours_path.to_string_lossy().into_owned(),
                    merged_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                ],
            )
        } else if tool_lower == "kdiff3" {
            (
                "kdiff3".to_string(),
                vec![
                    base_path.to_string_lossy().into_owned(),
                    ours_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                    "-o".to_string(),
                    merged_path.to_string_lossy().into_owned(),
                ],
            )
        } else if tool_lower == "p4merge" {
            (
                "p4merge".to_string(),
                vec![
                    base_path.to_string_lossy().into_owned(),
                    ours_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                    merged_path.to_string_lossy().into_owned(),
                ],
            )
        } else if tool_lower == "opendiff" {
            (
                "opendiff".to_string(),
                vec![
                    ours_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                    "-ancestor".to_string(),
                    base_path.to_string_lossy().into_owned(),
                    "-merge".to_string(),
                    merged_path.to_string_lossy().into_owned(),
                ],
            )
        } else if tool_lower == "vscode" || tool_lower == "code" {
            (
                "code".to_string(),
                vec![
                    "--merge".to_string(),
                    ours_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                    base_path.to_string_lossy().into_owned(),
                    merged_path.to_string_lossy().into_owned(),
                ],
            )
        } else if tool_lower == "cursor" {
            (
                "cursor".to_string(),
                vec![
                    "--merge".to_string(),
                    ours_path.to_string_lossy().into_owned(),
                    theirs_path.to_string_lossy().into_owned(),
                    base_path.to_string_lossy().into_owned(),
                    merged_path.to_string_lossy().into_owned(),
                ],
            )
        } else {
            // Assume it's a custom command configuration with placeholders
            let parts: Vec<&str> = tool_name.split_whitespace().collect();
            if parts.is_empty() {
                return Err(AppError::invalid_state(
                    "Merge tool command configuration is empty",
                ));
            }
            let prog = parts[0].to_string();
            let mut arg_list = Vec::new();
            for part in &parts[1..] {
                let substituted = part
                    .replace("%BASE", &base_path.to_string_lossy())
                    .replace("%OURS", &ours_path.to_string_lossy())
                    .replace("%THEIRS", &theirs_path.to_string_lossy())
                    .replace("%MERGED", &merged_path.to_string_lossy());
                arg_list.push(substituted);
            }
            (prog, arg_list)
        };

        let mut cmd = crate::commands::new_command(&program);
        cmd.args(args);

        let status = cmd.status().map_err(|e| {
            AppError::command(format!("Failed to start merge tool '{}': {}", program, e))
        })?;

        if status.success() {
            // Automatically stage the resolved file in Git if exit status is success
            let mut index = repo.index()?;
            index.add_path(std::path::Path::new(&file_path))?;
            index.write()?;
            Ok(())
        } else {
            Err(AppError::command(format!(
                "Merge tool exited with non-zero status: {:?}",
                status.code()
            )))
        }
    })
    .await?
}
