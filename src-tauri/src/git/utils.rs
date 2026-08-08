use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

/// Validates that a user-supplied file path is relative and does not contain directory traversal (`..`) components.
/// Returns the joined path if safe, or an error if invalid.
///
/// This check is purely syntactic. It is sufficient for callers that hand the
/// result to git (which resolves paths against the index, not the filesystem),
/// but **not** for callers that open the path directly — use
/// [`validate_path_no_symlink`] for those.
pub fn validate_path(base_path: &Path, user_path: &Path) -> Result<PathBuf, AppError> {
    if user_path.is_absolute() {
        return Err(AppError::invalid_state("Absolute paths are not allowed"));
    }

    for component in user_path.components() {
        if let Component::ParentDir = component {
            return Err(AppError::invalid_state("Path traversal is not allowed"));
        }
    }

    Ok(base_path.join(user_path))
}

/// [`validate_path`], plus a guarantee that nothing along the resolved path is
/// a symlink escaping `base_path`.
///
/// A repository can commit a symlink pointing anywhere on disk (`notes.txt ->
/// ~/.ssh/id_rsa`), and git will check it out. `fs::read_to_string` and
/// `fs::write` both follow symlinks, so a syntactically-clean relative path can
/// still read or overwrite an arbitrary file once the working tree contains one.
/// Every caller that touches the filesystem directly must use this instead.
pub fn validate_path_no_symlink(base_path: &Path, user_path: &Path) -> Result<PathBuf, AppError> {
    let joined = validate_path(base_path, user_path)?;

    // Walk each ancestor between the base and the target: a symlinked *parent*
    // directory redirects the leaf just as effectively as a symlinked leaf.
    let mut current = base_path.to_path_buf();
    for component in user_path.components() {
        current.push(component);
        match std::fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(AppError::invalid_state(format!(
                    "Refusing to follow the symbolic link at '{}'. \
                     Symlinked paths can point outside the repository.",
                    current.display()
                )));
            }
            // A path that does not exist yet is fine — the caller may be
            // creating it. Anything else is a real IO problem, so let the
            // caller's own open/read surface it with better context.
            _ => {}
        }
    }

    Ok(joined)
}

/// Validates that a repository path exists and is a valid directory.
#[allow(dead_code)]
pub fn validate_repo_path(path: &str) -> Result<PathBuf, AppError> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::not_found(format!(
            "Repository path does not exist: {}",
            path
        )));
    }
    if !p.is_dir() {
        return Err(AppError::invalid_state(format!(
            "Repository path is not a directory: {}",
            path
        )));
    }
    Ok(p.to_path_buf())
}

/// Validates a relative path string ensuring no path traversal.
#[allow(dead_code)]
pub fn validate_relative_path(path: &str) -> Result<&Path, AppError> {
    let p = Path::new(path);
    if p.is_absolute() {
        return Err(AppError::invalid_state("Absolute paths are not allowed"));
    }
    for component in p.components() {
        if let Component::ParentDir = component {
            return Err(AppError::invalid_state("Path traversal is not allowed"));
        }
    }
    Ok(p)
}

/// Canonicalizes a path string for consistent store tracking across platforms.
pub fn canonicalize_path(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.replace('\\', "/"))
}
