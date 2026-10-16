//! Shared Git helper functions to reduce code duplication across commands.

use crate::error::AppError;
use git2::{AnnotatedCommit, Commit, Repository, Signature};
use std::io::Write;
use std::process::Stdio;

/// Get the repository signature, rejecting with a descriptive error if `user.name`/
/// `user.email` are not configured — every commit-like operation (commits, stashes,
/// tags, merges) must use this rather than fabricating a placeholder identity.
pub fn require_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    repo.signature().map_err(|_| {
        AppError::invalid_state(
            "Git author name and email are not configured. \
             Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
        )
    })
}

/// How a merge-like operation (merge, pull, cherry-pick, revert) ended.
///
/// Serialised as `"success"` / `"conflicts"` — the strings the frontend has
/// always received — so only the Rust side gains the type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeOutcome {
    Success,
    Conflicts,
}

/// Merge `annotated` into the currently checked-out branch: fast-forward when
/// possible, otherwise a real merge, returning [`MergeOutcome::Conflicts`] if that leaves
/// the index unresolved. Shared by `merge_branch` and `pull`, which otherwise
/// carried two copies of the same analyze → checkout → merge → conflict-check
/// flow, differing only in their reflog wording and merge commit message.
pub fn perform_merge(
    repo: &Repository,
    annotated: &AnnotatedCommit,
    reflog_action: &str,
    commit_message: &str,
) -> Result<MergeOutcome, AppError> {
    let (merge_analysis, _) = repo.merge_analysis(&[annotated])?;

    if merge_analysis.is_up_to_date() {
        return Ok(MergeOutcome::Success);
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
        return Ok(MergeOutcome::Success);
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
        Ok(MergeOutcome::Conflicts)
    } else {
        let head = repo.head()?.peel_to_commit()?;
        let remote_commit = repo.find_commit(annotated.id())?;
        create_merge_commit(repo, &head, &remote_commit, commit_message)?;
        Ok(MergeOutcome::Success)
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
    let sig = require_signature(repo)?;
    let mut index = repo.index()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let signing = signing_config(repo);

    let oid = if signing.enabled {
        commit_signed_and_update_head(
            repo,
            &sig,
            &sig,
            message,
            &tree,
            &[head_commit, remote_commit],
            &signing,
        )?
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

/// Write a signed commit and move HEAD to it, as `repo.commit(Some("HEAD"), …)`
/// does for an unsigned one: the checked-out branch moves to the new commit
/// (or is created, for the first commit on an unborn branch), and a detached
/// HEAD moves itself.
///
/// The commit and merge paths each carried a copy of this.
pub fn commit_signed_and_update_head(
    repo: &Repository,
    author: &Signature,
    committer: &Signature,
    message: &str,
    tree: &git2::Tree,
    parents: &[&Commit],
    signing: &SigningConfig,
) -> Result<git2::Oid, AppError> {
    let buffer = repo.commit_create_buffer(author, committer, message, tree, parents)?;
    let content = std::str::from_utf8(&buffer)
        .map_err(|_| AppError::invalid_state("Commit buffer is not valid UTF-8"))?;
    let signature = sign_buffer(signing, content)?;
    let oid = repo.commit_signed(content, &signature, Some("gpgsig"))?;

    // The reflog file is one entry per line: use just the summary, mirroring
    // what `repo.commit()` writes for an unsigned commit.
    let reflog_message = format!(
        "commit (signed): {}",
        message.lines().next().unwrap_or_default()
    );

    match repo.head() {
        Ok(head) => {
            if head.is_branch() {
                if let Ok(refname) = head.name() {
                    let mut branch_ref = repo.find_reference(refname)?;
                    branch_ref.set_target(oid, &reflog_message)?;
                    repo.set_head(refname)?;
                }
            } else {
                repo.set_head_detached(oid)?;
            }
        }
        // An unborn branch (the repository's first commit): HEAD names a
        // branch that does not exist yet, so create it at the new commit.
        Err(_) => match repo
            .find_reference("HEAD")
            .ok()
            .and_then(|head| head.symbolic_target().ok().flatten().map(str::to_string))
        {
            Some(target) => {
                repo.reference(&target, oid, true, &reflog_message)?;
                repo.set_head(&target)?;
            }
            None => repo.set_head_detached(oid)?,
        },
    }

    Ok(oid)
}

/// How commits should be signed, read from git config.
///
/// Signing used to always run `gpg -bsa`, ignoring `gpg.format` and the
/// `gpg.*.program` settings — so anyone signing with SSH keys
/// (`gpg.format = ssh`, now common) could not commit at all.
#[derive(Debug, Clone, Default)]
pub struct SigningConfig {
    /// `commit.gpgsign`.
    pub enabled: bool,
    /// `gpg.format`: `openpgp` (the default), `x509` or `ssh`.
    pub format: String,
    /// `user.signingkey`.
    pub key: Option<String>,
    /// The signing program for `format`, if configured.
    pub program: Option<String>,
}

/// Read the signing configuration the way git does.
pub fn signing_config(repo: &Repository) -> SigningConfig {
    let Ok(config) = repo.config() else {
        return SigningConfig::default();
    };
    let get = |key: &str| config.get_string(key).ok().filter(|v| !v.trim().is_empty());

    let format = get("gpg.format").unwrap_or_else(|| "openpgp".to_string());
    let program = match format.as_str() {
        "ssh" => get("gpg.ssh.program"),
        "x509" => get("gpg.x509.program"),
        // `gpg.program` is the older spelling of `gpg.openpgp.program`.
        _ => get("gpg.openpgp.program").or_else(|| get("gpg.program")),
    };

    SigningConfig {
        enabled: config.get_bool("commit.gpgsign").unwrap_or(false),
        format,
        key: get("user.signingkey"),
        program,
    }
}

/// Produce the detached signature for a commit buffer, in whichever format
/// the configuration asks for.
///
/// Shared by the commit and merge paths, which previously carried two copies of
/// the signing invocation.
pub fn sign_buffer(config: &SigningConfig, content: &str) -> Result<String, AppError> {
    match config.format.as_str() {
        "ssh" => ssh_sign(config, content),
        "x509" => gpg_style_sign(
            config.program.as_deref().unwrap_or("gpgsm"),
            config.key.as_deref(),
            content,
        ),
        _ => gpg_style_sign(
            config.program.as_deref().unwrap_or("gpg"),
            config.key.as_deref(),
            content,
        ),
    }
}

/// `gpg`/`gpgsm`: ASCII-armoured detached signature, as git requests it.
fn gpg_style_sign(program: &str, key: Option<&str>, content: &str) -> Result<String, AppError> {
    let mut cmd = crate::commands::new_command(program);
    cmd.arg("--status-fd=2").arg("-bsa");
    if let Some(key) = key {
        cmd.arg("-u").arg(key);
    }
    run_signer(cmd, program, content)
}

/// SSH signing with `ssh-keygen -Y sign`, as `gpg.format = ssh` does in git.
///
/// `user.signingkey` is either a path to a key file (the private key, or the
/// public key whose private half is in ssh-agent) or a literal public key,
/// written `key::ssh-ed25519 AAAA…` (or without the prefix). A literal key is
/// written to a private temporary file, since `ssh-keygen` only takes files.
fn ssh_sign(config: &SigningConfig, content: &str) -> Result<String, AppError> {
    let key = config.key.as_deref().ok_or_else(|| {
        AppError::gpg(
            "Commit signing with SSH is enabled (gpg.format = ssh), but user.signingkey \
             is not set. Set it to your SSH key file, or disable commit.gpgsign.",
        )
    })?;

    let literal = key
        .strip_prefix("key::")
        .map(str::to_string)
        .or_else(|| key.starts_with("ssh-").then(|| key.to_string()));

    let mut temp_dir: Option<std::path::PathBuf> = None;
    let key_file = match literal {
        Some(public_key) => {
            let dir =
                std::env::temp_dir().join(format!("basilico_sshsign_{}", uuid::Uuid::new_v4()));
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&dir)?;
            let file = dir.join("signing_key.pub");
            std::fs::write(&file, format!("{}\n", public_key.trim()))?;
            temp_dir = Some(dir);
            file
        }
        None => expand_home(key),
    };

    let program = config.program.as_deref().unwrap_or("ssh-keygen");
    let mut cmd = crate::commands::new_command(program);
    cmd.args(["-Y", "sign", "-n", "git", "-f"]).arg(&key_file);
    let result = run_signer(cmd, program, content);

    if let Some(dir) = temp_dir {
        let _ = std::fs::remove_dir_all(dir);
    }
    result
}

/// `~/…` as git expands it in `user.signingkey`.
fn expand_home(path: &str) -> std::path::PathBuf {
    match (path.strip_prefix("~/"), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest),
        _ => std::path::PathBuf::from(path),
    }
}

/// Feed `content` to a signing program and return what it writes to stdout.
fn run_signer(
    mut cmd: std::process::Command,
    program: &str,
    content: &str,
) -> Result<String, AppError> {
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::command(format!("Failed to run {}: {}", program, e)))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| AppError::command(format!("Failed to wait for {}: {}", program, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::gpg(format!(
            "Signing with {} failed: {}",
            program,
            stderr.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod merge_outcome_tests {
    use super::MergeOutcome;

    /// The frontend compares against these exact strings.
    #[test]
    fn serialises_to_the_strings_the_frontend_expects() {
        assert_eq!(
            serde_json::to_string(&MergeOutcome::Success).unwrap(),
            "\"success\""
        );
        assert_eq!(
            serde_json::to_string(&MergeOutcome::Conflicts).unwrap(),
            "\"conflicts\""
        );
    }
}
