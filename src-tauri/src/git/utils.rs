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

/// Reject `user_path` if any component between `base_path` and the target is a
/// symlink. `include_leaf` decides whether the final component counts.
///
/// A path that does not exist yet is fine — the caller may be creating it.
/// Anything else is a real IO problem, so let the caller's own open/read
/// surface it with better context.
fn reject_symlinked_components(
    base_path: &Path,
    user_path: &Path,
    include_leaf: bool,
) -> Result<(), AppError> {
    let total = user_path.components().count();
    let mut current = base_path.to_path_buf();

    for (index, component) in user_path.components().enumerate() {
        current.push(component);

        let is_leaf = index + 1 == total;
        if is_leaf && !include_leaf {
            break;
        }

        if let Ok(meta) = std::fs::symlink_metadata(&current) {
            if meta.file_type().is_symlink() {
                return Err(AppError::invalid_state(format!(
                    "Refusing to follow the symbolic link at '{}'. \
                     Symlinked paths can point outside the repository.",
                    current.display()
                )));
            }
        }
    }

    Ok(())
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
    reject_symlinked_components(base_path, user_path, true)?;
    Ok(joined)
}

/// [`validate_path`], plus a guarantee that no *parent* directory along the way
/// is a symlink — while allowing the final component to be one.
///
/// This is the variant for deleting an untracked entry. Removing a symlink is
/// legitimate and is what `git clean` does: `fs::remove_file` unlinks the link
/// itself rather than its target, so a symlinked leaf is safe. A symlinked
/// *parent*, however, redirects the whole operation outside the working tree —
/// with `link -> /Users/me` committed in the repo, discarding
/// `link/.ssh/id_rsa` would delete the real key.
pub fn validate_path_symlinked_leaf_ok(
    base_path: &Path,
    user_path: &Path,
) -> Result<PathBuf, AppError> {
    let joined = validate_path(base_path, user_path)?;
    reject_symlinked_components(base_path, user_path, false)?;
    Ok(joined)
}

/// Canonicalizes a path string for consistent store tracking across platforms.
pub fn canonicalize_path(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.replace('\\', "/"))
}
