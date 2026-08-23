//! Shared Git helper functions to reduce code duplication across commands.

use crate::error::AppError;
use git2::{AnnotatedCommit, Commit, Repository, Signature};
use std::io::Write;
use std::process::Stdio;

/// Get the repository signature, rejecting with a descriptive error if `user.name`/
/// `user.email` are not configured — every commit-like operation (commits, stashes,
/// tags, merges) must use this rather than fabricating a placeholder identity.
pub fn get_or_fallback_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    repo.signature().map_err(|_| {
        AppError::invalid_state(
            "Git author name and email are not configured. \
             Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
        )
    })
}

/// Merge `annotated` into the currently checked-out branch: fast-forward when
/// possible, otherwise a real merge, returning `"conflicts"` if that leaves
/// the index unresolved. Shared by `merge_branch` and `pull`, which otherwise
/// carried two copies of the same analyze → checkout → merge → conflict-check
/// flow, differing only in their reflog wording and merge commit message.
pub fn perform_merge(
    repo: &Repository,
    annotated: &AnnotatedCommit,
    reflog_action: &str,
    commit_message: &str,
) -> Result<String, AppError> {
    let (merge_analysis, _) = repo.merge_analysis(&[annotated])?;

    if merge_analysis.is_up_to_date() {
        return Ok("success".to_string());
    }

    if merge_analysis.is_fast_forward() {
        let target_oid = annotated.id();
        let target_object = repo.find_object(target_oid, None)?;
        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.safe();
        repo.checkout_tree(&target_object, Some(&mut checkout_opts))?;

        let head_ref = repo.head()?;
        if head_ref.is_branch() {
            if let Ok(refname) = head_ref.name() {
                let mut r = repo.find_reference(refname)?;
                r.set_target(
                    target_oid,
                    &format!("{}: fast-forward to {}", reflog_action, target_oid),
                )?;
                repo.set_head(refname)?;
            }
        } else {
            repo.set_head_detached(target_oid)?;
        }
        return Ok("success".to_string());
    }

    let mut merge_opts = git2::MergeOptions::new();
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(
        &[annotated],
        Some(&mut merge_opts),
        Some(&mut checkout_opts),
    )?;

    if repo.index().map(|idx| idx.has_conflicts()).unwrap_or(false) {
        Ok("conflicts".to_string())
    } else {
        let head = repo.head()?.peel_to_commit()?;
        let remote_commit = repo.find_commit(annotated.id())?;
        create_merge_commit(repo, &head, &remote_commit, commit_message)?;
        Ok("success".to_string())
    }
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

    let (should_sign, signing_key) = signing_config(repo);

    let oid = if should_sign {
        let commit_content_buf =
            repo.commit_create_buffer(&sig, &sig, message, &tree, &[head_commit, remote_commit])?;
        let commit_content = std::str::from_utf8(&commit_content_buf)
            .map_err(|_| AppError::invalid_state("Commit buffer is not valid UTF-8"))?;

        let signature = gpg_sign(commit_content, signing_key.as_deref())?;
        let commit_oid = repo.commit_signed(commit_content, &signature, Some("gpgsig"))?;

        // Reflog entries are one per line; use just the summary, mirroring
        // what `repo.commit()` builds automatically for the unsigned path.
        let reflog_summary = message.lines().next().unwrap_or_default();

        // Update HEAD
        let head_ref = repo.head()?;
        if head_ref.is_branch() {
            if let Ok(refname) = head_ref.name() {
                let mut r = repo.find_reference(refname)?;
                r.set_target(commit_oid, &format!("commit (signed): {}", reflog_summary))?;
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

/// Produce a detached GPG signature for `content` using the configured key.
///
/// Shared by the commit and merge paths, which previously carried two copies of
/// this gpg invocation.
pub fn gpg_sign(content: &str, signing_key: Option<&str>) -> Result<String, AppError> {
    let mut cmd = crate::commands::new_command("gpg");
    cmd.arg("--status-fd").arg("2").arg("-bsa");
    if let Some(key) = signing_key {
        cmd.arg("-u").arg(key);
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::command(format!("Failed to spawn gpg: {}", e)))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| AppError::command(format!("Failed to wait for gpg: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::gpg(format!("GPG signing failed: {}", stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Whether commits should be GPG-signed, and with which key.
pub fn signing_config(repo: &Repository) -> (bool, Option<String>) {
    match repo.config() {
        Ok(config) => (
            config.get_bool("commit.gpgsign").unwrap_or(false),
            config.get_string("user.signingkey").ok(),
        ),
        Err(_) => (false, None),
    }
}
