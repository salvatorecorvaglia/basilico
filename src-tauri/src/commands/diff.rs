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
pub const MAX_EDITOR_BYTES: usize = 5 * 1024 * 1024;

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
            Side::Text(String::from_utf8_lossy(bytes).into_owned())
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
            Side::Text(String::from_utf8_lossy(blob.content()).into_owned())
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
    let too_large = sides.iter().any(|s| matches!(s, Some(Side::TooLarge)));
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

/// The blob at `file_path` in `tree`, if there is one.
///
/// This lookup chain was written out four times across the commands below.
fn blob_in_tree<'r>(
    repo: &'r git2::Repository,
    tree: &git2::Tree,
    file_path: &str,
) -> Option<git2::Blob<'r>> {
    let entry = tree.get_path(std::path::Path::new(file_path)).ok()?;
    repo.find_blob(entry.id()).ok()
}

/// The blob at `file_path` in the tree `rev` resolves to.
fn blob_at_revision<'r>(
    repo: &'r git2::Repository,
    rev: &str,
    file_path: &str,
) -> Option<git2::Blob<'r>> {
    let tree = repo.revparse_single(rev).ok()?.peel_to_tree().ok()?;
    blob_in_tree(repo, &tree, file_path)
}

/// The stage-0 index entry's blob for `file_path`.
fn blob_in_index<'r>(repo: &'r git2::Repository, file_path: &str) -> Option<git2::Blob<'r>> {
    let index = repo.index().ok()?;
    let entry = index.get_path(std::path::Path::new(file_path), 0)?;
    repo.find_blob(entry.id).ok()
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

        let head_blob = || blob_at_revision(&repo, "HEAD", &file_path);

        let (original, modified) = if is_staged {
            // HEAD → index
            let head_path = original_path.as_deref().unwrap_or(&file_path);
            (
                blob_at_revision(&repo, "HEAD", head_path).map(|b| Side::from_blob(&b)),
                blob_in_index(&repo, &file_path).map(|b| Side::from_blob(&b)),
            )
        } else {
            // Index (falling back to HEAD) → working directory
            let original = blob_in_index(&repo, &file_path)
                .or_else(head_blob)
                .map(|b| Side::from_blob(&b));

            let modified = match std::fs::symlink_metadata(&full_path) {
                Ok(meta) if meta.file_type().is_symlink() => std::fs::read_link(&full_path)
                    .ok()
                    .map(|target| Side::Text(target.to_string_lossy().into_owned())),
                Ok(meta) if meta.is_file() => {
                    if meta.len() as usize > MAX_EDITOR_BYTES {
                        // Not read at all.
                        Some(Side::TooLarge)
                    } else {
                        std::fs::read(&full_path).ok().map(|b| Side::from_bytes(&b))
                    }
                }
                _ => None,
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

        // Resolve revision spec (like commit SHA or SHA^)
        let obj = repo.revparse_single(&revision)?;

        let blob = if let Some(blob) = obj.as_blob() {
            blob.clone()
        } else {
            let tree = obj
                .peel_to_tree()
                .map_err(|_| AppError::invalid_state("Unable to resolve object to a blob"))?;
            blob_in_tree(&repo, &tree, &file_path).ok_or_else(|| {
                AppError::not_found(format!("'{}' does not exist at {}", file_path, revision))
            })?
        };

        match Side::from_blob(&blob) {
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
        let original = blob_at_revision(&repo, &base, base_path).map(|b| Side::from_blob(&b));
        let modified = blob_at_revision(&repo, &target, &file_path).map(|b| Side::from_blob(&b));
        Ok(content_pair(original, modified))
    })
    .await?
}
