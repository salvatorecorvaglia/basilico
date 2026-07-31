use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

/// Validates that a user-supplied file path is relative and does not contain directory traversal (`..`) components.
/// Returns the joined path if safe, or an error if invalid.
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



