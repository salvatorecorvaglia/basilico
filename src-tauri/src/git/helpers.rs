//! Shared Git helper functions to reduce code duplication across commands.

use crate::error::AppError;
use git2::{Commit, Repository, Signature};

/// Get the repository signature, falling back to a default "Basilico User" if not configured.
pub fn get_or_fallback_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    repo.signature()
        .or_else(|_| Signature::now("Basilico User", "user@basilico.app"))
        .map_err(|e| AppError::git(format!("Failed to create signature: {}", e)))
}

/// Create a merge commit pointing HEAD to the merge of `head_commit` and `remote_commit`.
/// Returns the OID of the new merge commit.
pub fn create_merge_commit(
    repo: &Repository,
    head_commit: &Commit,
    remote_commit: &Commit,
    message: &str,
) -> Result<git2::Oid, AppError> {
    let sig = get_or_fallback_signature(repo)?;
    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;
    let oid = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        message,
        &tree,
        &[head_commit, remote_commit],
    )?;
    repo.cleanup_state()?;
    Ok(oid)
}
