use crate::error::AppError;
use crate::git::diff_parser;

#[tauri::command]
pub async fn get_workdir_diff(path: String) -> Result<Vec<diff_parser::FileDiff>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || diff_parser::get_workdir_diff(&path)).await?
}

#[tauri::command]
pub async fn get_staged_diff(path: String) -> Result<Vec<diff_parser::FileDiff>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || diff_parser::get_staged_diff(&path)).await?
}

#[tauri::command]
pub async fn get_commit_diff(
    path: String,
    oid: String,
) -> Result<Vec<diff_parser::FileDiff>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || diff_parser::get_commit_diff(&path, &oid)).await?
}

#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
    is_staged: bool,
) -> Result<diff_parser::FileDiff, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || diff_parser::get_file_diff(&path, &file_path, is_staged))
        .await?
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentPair {
    pub original: String,
    pub modified: String,
    /// Either side is binary: both strings are left empty, since decoding
    /// binary data as text only produces garbage for the editor.
    pub is_binary: bool,
    /// Either side exceeds [`MAX_EDITOR_BYTES`]: both strings are left empty.
    pub too_large: bool,
}

/// The largest file sent to the diff editor, per side.
///
/// Both versions of a file used to cross IPC whole, however large — a
/// multi-hundred-megabyte log or dataset froze the window while Monaco tried
/// to lay it out. Beyond this the UI says the file is too large instead.
pub const MAX_EDITOR_BYTES: usize = crate::git::content_limits::MAX_TEXT_BYTES;

/// What one side of a diff holds, as the editor can use it.
enum Side {
    Text(String),
    Binary,
    TooLarge,
}

impl Side {
    fn from_bytes(bytes: &[u8]) -> Side {
        if bytes.len() > MAX_EDITOR_BYTES {
            Side::TooLarge
        } else if looks_binary(bytes) {
            Side::Binary
        } else {
            match std::str::from_utf8(bytes) {
                Ok(text) => Side::Text(text.to_owned()),
                Err(_) => Side::Binary,
            }
        }
    }

    fn from_blob(blob: &git2::Blob) -> Side {
        // Checked before touching the content, so an oversized blob is not
        // decoded at all.
        if blob.size() > MAX_EDITOR_BYTES {
            Side::TooLarge
        } else if blob.is_binary() {
            Side::Binary
        } else {
            Side::from_bytes(blob.content())
        }
    }
}

/// git's own heuristic: a NUL byte in the first 8000 bytes means binary.
fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

/// Combine two sides into the pair the UI receives.
fn content_pair(original: Option<Side>, modified: Option<Side>) -> FileContentPair {
    let sides = [&original, &modified];
    // Charge JSON escaping before either string crosses IPC. Two ordinary
    // UTF-8 sides fit within 10 MB; control-heavy text must fit that budget too.
    let ipc_bytes: usize = sides
        .iter()
        .map(|side| match side {
            Some(Side::Text(text)) => text
                .bytes()
                .map(|byte| match byte {
                    b'"' | b'\\' => 2,
                    0..=31 => 6,
                    _ => 1,
                })
                .sum::<usize>(),
            _ => 0,
        })
        .sum();
    let too_large =
        ipc_bytes > 2 * MAX_EDITOR_BYTES || sides.iter().any(|s| matches!(s, Some(Side::TooLarge)));
    let is_binary = !too_large && sides.iter().any(|s| matches!(s, Some(Side::Binary)));
    let text = |side: Option<Side>| match side {
        Some(Side::Text(t)) if !too_large && !is_binary => t,
        _ => String::new(),
    };
    FileContentPair {
        original: text(original),
        modified: text(modified),
        is_binary,
        too_large,
    }
}

fn read_blob_side(repo: &git2::Repository, oid: git2::Oid) -> Result<Side, AppError> {
    if !crate::git::content_limits::check_blob(repo, oid)? {
        return Ok(Side::TooLarge);
    }
    Ok(Side::from_blob(&repo.find_blob(oid)?))
}

fn blob_in_tree(
    repo: &git2::Repository,
    tree: &git2::Tree,
    file_path: &str,
) -> Result<Option<Side>, AppError> {
    match tree.get_path(std::path::Path::new(file_path)) {
        Ok(entry) if entry.kind() == Some(git2::ObjectType::Blob) => {
            read_blob_side(repo, entry.id()).map(Some)
        }
        Ok(_) => Ok(None),
        Err(error) if error.code() == git2::ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn blob_at_revision(
    repo: &git2::Repository,
    rev: &str,
    file_path: &str,
) -> Result<Option<Side>, AppError> {
    let object = match repo.revparse_single(rev) {
        Ok(object) => object,
        Err(error)
            if rev == "HEAD"
                && matches!(
                    error.code(),
                    git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
                ) =>
        {
            return Ok(None)
        }
        Err(error) => return Err(error.into()),
    };
    blob_in_tree(repo, &object.peel_to_tree()?, file_path)
}

fn blob_in_index(repo: &git2::Repository, file_path: &str) -> Result<Option<Side>, AppError> {
    let index = repo.index()?;
    index
        .get_path(std::path::Path::new(file_path), 0)
        .map(|entry| {
            if entry.mode == 0o160000 {
                Ok(Side::Binary)
            } else {
                read_blob_side(repo, entry.id)
            }
        })
        .transpose()
}

/// `original_path` is where the file was before a staged rename. Without it the
/// HEAD side was read under the new name, found nothing, and the editor showed
/// the whole file as added.
#[tauri::command]
pub async fn get_file_content_pair(
    path: String,
    file_path: String,
    is_staged: bool,
    original_path: Option<String>,
) -> Result<FileContentPair, AppError> {
    crate::state::ensure_open_repo(&path)?;
    // git2's index lookup unwraps its path conversion. Reject root-only and
    // NUL-containing file selections before they can panic in a worker task.
    if file_path.contains('\0')
        || !std::path::Path::new(&file_path)
            .components()
            .any(|part| matches!(part, std::path::Component::Normal(_)))
    {
        return Err(AppError::invalid_state("Select a working-tree file."));
    }
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        // No symlinked *parent* may redirect the read outside the repository.
        // The file itself may be a symlink — git tracks symlinks, and
        // refusing them made every committed symlink undiffable — but it is
        // never followed: its content, as git records it, is the link target.
        let full_path = crate::git::utils::validate_path_symlinked_leaf_ok(
            workdir,
            std::path::Path::new(&file_path),
        )?;

        if let Some(original_path) = &original_path {
            crate::git::utils::validate_path(workdir, std::path::Path::new(original_path))?;
        }

        let (original, modified) = if is_staged {
            // HEAD → index
            let head_path = original_path.as_deref().unwrap_or(&file_path);
            (
                blob_at_revision(&repo, "HEAD", head_path)?,
                blob_in_index(&repo, &file_path)?,
            )
        } else {
            // Index (falling back to HEAD) → working directory
            let original = match blob_in_index(&repo, &file_path)? {
                Some(side) => Some(side),
                None => blob_at_revision(&repo, "HEAD", &file_path)?,
            };

            let modified = match std::fs::symlink_metadata(&full_path) {
                Ok(meta) if meta.file_type().is_symlink() => Some(Side::Text(
                    std::fs::read_link(&full_path)?
                        .to_string_lossy()
                        .into_owned(),
                )),
                Ok(meta) if meta.is_file() => {
                    if meta.len() as usize > MAX_EDITOR_BYTES {
                        // Not read at all.
                        Some(Side::TooLarge)
                    } else {
                        Some(
                            match crate::git::content_limits::read_file(&full_path)
                                .map_err(|e| AppError::io(e.to_string()))?
                            {
                                Some(bytes) => Side::from_bytes(&bytes),
                                None => Side::TooLarge,
                            },
                        )
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => return Err(error.into()),
                Ok(_) => None,
            };
            (original, modified)
        };

        Ok(content_pair(original, modified))
    })
    .await?
}

#[tauri::command]
pub async fn get_file_content_at_revision(
    path: String,
    file_path: String,
    revision: String,
) -> Result<String, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let _validated_full_path =
            crate::git::utils::validate_path(workdir, std::path::Path::new(&file_path))?;

        // Resolve to an id first: revparse_single would inflate a blob before
        // we could reject an oversized `HEAD:path` or raw blob-id revision.
        let args = [
            "rev-parse",
            "--verify",
            "--end-of-options",
            revision.as_str(),
        ];
        let output = crate::commands::git_output(&args, &path)?;
        if !output.status.success() {
            return Err(AppError::git(crate::commands::git_failure_message(
                &args, &output,
            )));
        }
        let oid = git2::Oid::from_str(String::from_utf8_lossy(&output.stdout).trim())?;
        let (size, kind) = repo.odb()?.read_header(oid)?;
        let blob = if size > MAX_EDITOR_BYTES {
            Side::TooLarge
        } else if kind == git2::ObjectType::Blob {
            read_blob_side(&repo, oid)?
        } else {
            let tree = repo
                .find_object(oid, None)?
                .peel_to_tree()
                .map_err(|_| AppError::invalid_state("Unable to resolve object to a blob"))?;
            blob_in_tree(&repo, &tree, &file_path)?.ok_or_else(|| {
                AppError::not_found(format!("'{}' does not exist at {}", file_path, revision))
            })?
        };

        match blob {
            Side::Text(text) => Ok(text),
            Side::Binary => Err(AppError::invalid_state(format!(
                "'{}' is a binary file and cannot be shown as text.",
                file_path
            ))),
            Side::TooLarge => Err(AppError::invalid_state(format!(
                "'{}' is larger than {} MB and is too large to display.",
                file_path,
                MAX_EDITOR_BYTES / (1024 * 1024)
            ))),
        }
    })
    .await?
}

#[tauri::command]
pub async fn get_compare_diff(
    path: String,
    base: String,
    target: String,
) -> Result<Vec<diff_parser::FileDiff>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || diff_parser::get_compare_diff(&path, &base, &target))
        .await?
}

/// `base_path` is the file's path at `base` when it was renamed between the two
/// revisions; it defaults to `file_path`.
#[tauri::command]
pub async fn get_file_content_pair_revisions(
    path: String,
    file_path: String,
    base: String,
    target: String,
    base_path: Option<String>,
) -> Result<FileContentPair, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        let _validated_full_path =
            crate::git::utils::validate_path(workdir, std::path::Path::new(&file_path))?;

        if let Some(base_path) = &base_path {
            crate::git::utils::validate_path(workdir, std::path::Path::new(base_path))?;
        }

        let base_path = base_path.as_deref().unwrap_or(&file_path);
        let original = blob_at_revision(&repo, &base, base_path)?;
        let modified = blob_at_revision(&repo, &target, &file_path)?;
        Ok(content_pair(original, modified))
    })
    .await?
}

#[cfg(test)]
mod display_budget_tests {
    use super::*;
    #[test]
    fn json_escaping_is_charged_before_sending_editor_content() {
        let text = "\u{1f}".repeat(2 * 1024 * 1024);
        let pair = content_pair(Some(Side::Text(text)), None);
        assert!(pair.too_large);
        assert!(pair.original.is_empty());
    }
}
