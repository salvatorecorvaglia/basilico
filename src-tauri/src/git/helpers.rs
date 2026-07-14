//! Shared Git helper functions to reduce code duplication across commands.

use crate::error::AppError;
use git2::{Commit, Repository, Signature};
use std::io::Write;
use std::process::Stdio;

/// Get the repository signature, falling back to a default "Basilico User" if not configured.
pub fn get_or_fallback_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    repo.signature().map_err(|_| {
        AppError::invalid_state(
            "Git author name and email are not configured. \
             Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
        )
    })
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

    // Check if GPG signing is enabled in Git config
    let config = repo.config()?;
    let gpg_sign = config.get_bool("commit.gpgsign").unwrap_or(false);
    let signing_key = config.get_string("user.signingkey").ok();

    let oid = if gpg_sign {
        // GPG sign merge commit
        let commit_content_buf = repo.commit_create_buffer(
            &sig,
            &sig,
            message,
            &tree,
            &[head_commit, remote_commit],
        )?;
        let commit_content = std::str::from_utf8(&commit_content_buf)
            .map_err(|_| AppError::invalid_state("Commit buffer is not valid UTF-8"))?;

        let mut cmd = crate::commands::new_command("gpg");
        cmd.arg("--status-fd").arg("2").arg("-bsa");
        if let Some(ref key) = signing_key {
            cmd.arg("-u").arg(key);
        }

        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| AppError::command(format!("Failed to spawn gpg: {}", e)))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(commit_content.as_bytes())?;
        }

        let output = child.wait_with_output().map_err(|e| AppError::command(format!("Failed to wait for gpg: {}", e)))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AppError::gpg(format!("GPG signing failed: {}", stderr)));
        }

        let signature = String::from_utf8_lossy(&output.stdout).to_string();
        let commit_oid = repo.commit_signed(commit_content, &signature, Some("gpgsig"))?;

        // Update HEAD
        let head_ref = repo.head()?;
        if head_ref.is_branch() {
            if let Some(refname) = head_ref.name() {
                let mut r = repo.find_reference(refname)?;
                r.set_target(commit_oid, &format!("commit (signed): {}", message))?;
                repo.set_head(refname)?;
            }
        } else {
            repo.set_head_detached(commit_oid)?;
        }
        commit_oid
    } else {
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &[head_commit, remote_commit],
        )?
    };

    repo.cleanup_state()?;
    Ok(oid)
}
