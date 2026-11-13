use crate::error::AppError;
use git2::Repository;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStages {
    pub marker_size: usize,
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
            let read = |entry: Option<git2::IndexEntry>| -> Result<Option<String>, AppError> {
                entry
                    .map(|entry| {
                        if !crate::git::content_limits::check_blob(repo, entry.id)? {
                            return Err(AppError::invalid_state(
                                "Conflict exceeds the 5 MB editor limit. Choose a side instead.",
                            ));
                        }
                        let blob = repo.find_blob(entry.id)?;
                        if blob.size() > crate::commands::diff::MAX_EDITOR_BYTES
                            || blob.is_binary()
                            || blob.content().contains(&0)
                        {
                            return Err(AppError::invalid_state(
                                "This conflict cannot be edited as text. Choose a side instead.",
                            ));
                        }
                        String::from_utf8(blob.content().to_vec()).map_err(|_| {
                            AppError::invalid_state(
                                "Conflict contains non-UTF-8 content; choose a side instead.",
                            )
                        })
                    })
                    .transpose()
            };
            base = read(conflict.ancestor)?;
            ours = read(conflict.our)?;
            theirs = read(conflict.their)?;
            break;
        }
    }

    Ok(ConflictStages {
        base,
        ours,
        theirs,
        marker_size: conflict_marker_size(repo, file_path),
    })
}

#[tauri::command]
pub async fn get_conflict_stages(
    repo_path: String,
    file_path: String,
) -> Result<ConflictStages, AppError> {
    crate::state::ensure_open_repo(&repo_path)?;
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
    crate::state::ensure_open_repo(&repo_path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&repo_path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&repo_path)?;

        let repo = Repository::open(&repo_path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        // Written below via `fs::write`, which follows symlinks and would
        // otherwise overwrite whatever the link points at.
        let validated_full_path =
            crate::git::utils::validate_path_no_symlink(workdir, Path::new(&file_path))?;

        if has_conflict_markers_with_size(&merged_content, conflict_marker_size(&repo, &file_path))
        {
            return Err(AppError::conflict(
                "Resolve all conflict markers before staging.",
            ));
        }
        if conflict_sides(&repo, &file_path)?.is_none() {
            return Err(AppError::invalid_state(
                "This file is no longer conflicted. Refresh before saving.",
            ));
        }
        extract_conflict_stages(&repo, &file_path)?;
        if merged_content.len() > crate::commands::diff::MAX_EDITOR_BYTES
            || merged_content.contains('\0')
        {
            return Err(AppError::invalid_state(
                "The merged result cannot be saved as text.",
            ));
        }
        let metadata = fs::metadata(&validated_full_path)?;
        if metadata.len() > crate::commands::diff::MAX_EDITOR_BYTES as u64 {
            return Err(AppError::invalid_state(
                "The working file is too large for the merge editor.",
            ));
        }
        let current =
            crate::git::content_limits::read_file(&validated_full_path)?.ok_or_else(|| {
                AppError::invalid_state("The working file is too large for the merge editor.")
            })?;
        if current.contains(&0) || std::str::from_utf8(&current).is_err() {
            return Err(AppError::invalid_state(
                "The working file cannot be edited as text.",
            ));
        }
        fs::write(&validated_full_path, merged_content)?;

        let mut index = repo.index()?;
        index.add_path(Path::new(&file_path))?;
        index.write()?;

        Ok(())
    })
    .await?
}

/// Whether the conflict on `file_path` has an "ours" and a "theirs" entry, or
/// `None` when the path is not in conflict at all.
fn conflict_sides(repo: &Repository, file_path: &str) -> Result<Option<(bool, bool)>, AppError> {
    let index = repo.index()?;
    let target = normalize_git_path(file_path);
    for conflict in index.conflicts()? {
        let conflict = conflict?;
        let path = conflict
            .our
            .as_ref()
            .or(conflict.their.as_ref())
            .or(conflict.ancestor.as_ref())
            .map(|entry| normalize_git_path(&String::from_utf8_lossy(&entry.path)));
        if path.as_deref() == Some(target.as_str()) {
            return Ok(Some((conflict.our.is_some(), conflict.their.is_some())));
        }
    }
    Ok(None)
}

/// Resolve a conflict by taking one side wholesale.
///
/// This used to happen in the renderer: read both stages as (lossy) UTF-8
/// text, then write the chosen one back through `save_merged_resolution`.
/// That corrupted binary files, and a side that had *deleted* the file came
/// back as an empty file instead of a deletion.
///
/// The side is checked out with `git checkout --ours/--theirs`, which keeps
/// the exact bytes and file mode and runs the same smudge filters (line
/// endings, Git LFS) a checkout normally would. A side that deleted the file
/// resolves to removing the path, as `git rm` would.
#[tauri::command]
pub async fn resolve_conflict_side(
    repo_path: String,
    file_path: String,
    side: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&repo_path)?;
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&repo_path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&repo_path)?;

        let repo = Repository::open(&repo_path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?
            .to_path_buf();
        crate::git::utils::validate_path(&workdir, Path::new(&file_path))?;

        let side_flag = match side.as_str() {
            "ours" => "--ours",
            "theirs" => "--theirs",
            other => {
                return Err(AppError::invalid_state(format!(
                    "Unknown conflict side '{}': expected 'ours' or 'theirs'",
                    other
                )))
            }
        };

        let (has_ours, has_theirs) = conflict_sides(&repo, &file_path)?
            .ok_or_else(|| AppError::not_found(format!("'{}' is not in conflict", file_path)))?;
        let side_exists = if side_flag == "--ours" {
            has_ours
        } else {
            has_theirs
        };

        // `--` keeps a path beginning with '-' from being read as an option.
        if side_exists {
            crate::commands::run_git_cmd(&["checkout", side_flag, "--", &file_path], &repo_path)?;
            crate::commands::run_git_cmd(&["add", "--", &file_path], &repo_path)?;
        } else {
            // `--ignore-unmatch`: the file may already be gone from disk.
            crate::commands::run_git_cmd(
                &["rm", "--quiet", "--ignore-unmatch", "--", &file_path],
                &repo_path,
            )?;
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn launch_external_merge_tool<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    repo_path: String,
    file_path: String,
    tool_name: String,
) -> Result<(), AppError> {
    crate::state::ensure_open_repo(&repo_path)?;
    // The built-in presets below only ever select among a fixed set of known
    // program names, so `tool_name` is safe to use for that match. The
    // "custom command" fallback executes whatever program it resolves to,
    // so that branch uses the value stored in settings rather than trusting
    // the IPC parameter itself — see `get_merge_tool`.
    let stored_merge_tool = crate::commands::settings::get_merge_tool(&app);
    tokio::task::spawn_blocking(move || {
        let mutation = crate::state::repository_mutation_lock(&repo_path);
        let _mutation_guard = mutation.lock();
        crate::state::ensure_open_repo(&repo_path)?;

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
        // Removed on every return path. Only the success path cleaned up, so
        // each failure (an invalid path, a tool that would not start) left a
        // directory holding both sides of the conflict in the temp dir.
        let _cleanup = TempDirGuard(temp_dir.clone());

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
        // Handed to an external merge tool that will write to it.
        let merged_path =
            crate::git::utils::validate_path_no_symlink(workdir, std::path::Path::new(&file_path))?;

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
            // Assume it's a custom command configuration with placeholders.
            // Use the command stored in settings, not the raw `tool_name`
            // argument, so an IPC caller can't run an arbitrary program by
            // simply passing one in.
            let configured = stored_merge_tool.as_deref().unwrap_or("");
            if configured != tool_name {
                return Err(AppError::invalid_state(
                    "Merge tool does not match the one configured in settings.",
                ));
            }
            let parts: Vec<&str> = configured.split_whitespace().collect();
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

        // This session's scratch files are no longer needed once the tool exits.
        // Only our own directory is removed: a blanket sweep of every
        // `basilico_merge_*` directory would delete the working files of another
        // merge tool the user still has open.
        let _ = std::fs::remove_dir_all(&temp_dir);

        if !status.success() {
            return Err(AppError::command(format!(
                "Merge tool exited with non-zero status: {:?}",
                status.code()
            )));
        }

        // Staging a file that still contains conflict markers would commit them.
        // Check before clearing the conflict from the index.
        //
        // A read failure is not "no markers". `unwrap_or_default` turned an
        // unreadable or non-UTF-8 merge result into an empty string, which sails
        // through the check below and stages whatever the merge tool actually
        // left on disk.
        let merged_text = std::fs::read_to_string(&merged_path).map_err(|e| {
            AppError::io(format!(
                "Could not read '{}' back after the merge tool exited, so it \
                 cannot be checked for leftover conflict markers: {}",
                file_path, e
            ))
        })?;
        if has_conflict_markers_with_size(&merged_text, conflict_marker_size(&repo, &file_path)) {
            return Err(AppError::conflict(format!(
                "'{}' still contains conflict markers (<<<<<<<, =======, >>>>>>>). \
                 Resolve them before staging the file.",
                file_path
            )));
        }

        let mut index = repo.index()?;
        index.add_path(std::path::Path::new(&file_path))?;
        index.write()?;
        Ok(())
    })
    .await?
}

/// Removes a scratch directory when dropped.
struct TempDirGuard(std::path::PathBuf);

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Reject complete or incomplete marker lines, including custom marker sizes.
/// A separator alone is ordinary text (for example a Markdown heading underline).
fn conflict_marker_size(repo: &Repository, path: &str) -> usize {
    repo.get_attr(
        Path::new(path),
        "conflict-marker-size",
        git2::AttrCheckFlags::FILE_THEN_INDEX,
    )
    .ok()
    .flatten()
    .and_then(|s| s.parse::<usize>().ok())
    .filter(|&n| n > 0)
    .unwrap_or(7)
}

pub fn has_conflict_markers(content: &str) -> bool {
    has_conflict_markers_with_size(content, 7)
}

fn has_conflict_markers_with_size(content: &str, marker_size: usize) -> bool {
    content.lines().any(|line| {
        ['<', '>', '|'].iter().any(|&marker| {
            let count = line.chars().take_while(|&c| c == marker).count();
            (count >= 3 || count == marker_size)
                && line[count..].chars().next().is_none_or(char::is_whitespace)
        })
    })
}
