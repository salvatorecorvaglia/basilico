use crate::error::AppError;
use git2::Repository;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ConflictStages {
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
}

/// Helper to normalize paths to POSIX slash format for Git index comparison
pub fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// Extracts conflict stages (base, ours, theirs) for a given file path from a repository.
pub fn extract_conflict_stages(
    repo: &Repository,
    file_path: &str,
) -> Result<ConflictStages, AppError> {
    let index = repo.index()?;
    let normalized_target = normalize_git_path(file_path);

    let mut base = None;
    let mut ours = None;
    let mut theirs = None;

    let conflicts = index.conflicts()?;
    for conflict_res in conflicts {
        let conflict = conflict_res?;

        let path_matched = match &conflict.our {
            Some(entry) => {
                normalize_git_path(&String::from_utf8_lossy(&entry.path)) == normalized_target
            }
            None => match &conflict.their {
                Some(entry) => {
                    normalize_git_path(&String::from_utf8_lossy(&entry.path)) == normalized_target
                }
                None => match &conflict.ancestor {
                    Some(entry) => {
                        normalize_git_path(&String::from_utf8_lossy(&entry.path))
                            == normalized_target
                    }
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
pub async fn get_conflict_stages(
    repo_path: String,
    file_path: String,
) -> Result<ConflictStages, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        extract_conflict_stages(&repo, &file_path)
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

#[tauri::command]
pub async fn launch_external_merge_tool(
    repo_path: String,
    file_path: String,
    tool_name: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let stages = extract_conflict_stages(&repo, &file_path)?;

        let base_content = stages.base.unwrap_or_default();
        let ours_content = stages.ours.unwrap_or_default();
        let theirs_content = stages.theirs.unwrap_or_default();

        if base_content.is_empty() && ours_content.is_empty() && theirs_content.is_empty() {
            return Err(AppError::invalid_state(format!(
                "No conflicts found for file: {}",
                file_path
            )));
        }

        // Clean up any stale basilico merge temporary directories
        if let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("basilico_merge_") {
                        let _ = std::fs::remove_dir_all(&path);
                    }
                }
            }
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
                    "--wait".to_string(),
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
                    "--wait".to_string(),
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
