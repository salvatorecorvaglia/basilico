use std::path::{Path, Component, PathBuf};
use crate::error::AppError;

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
