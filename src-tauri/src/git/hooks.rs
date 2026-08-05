//! Git hook discovery and execution.
//!
//! Only `pre-commit` used to run, and only from `.git/hooks`. That silently
//! skipped `commit-msg` (widely used for message linting and trailer
//! injection), ignored `core.hooksPath` — which every Husky/lefthook setup
//! relies on — and never gave `prepare-commit-msg` or `post-commit` a chance.

use crate::error::AppError;
use git2::Repository;
use std::path::{Path, PathBuf};

/// Outcome of running a hook that is allowed to fail without aborting.
pub struct HookOutput {
    pub ran: bool,
    pub success: bool,
    pub combined_output: String,
}

/// Resolve the directory holding this repository's hooks.
///
/// Precedence matches git: `core.hooksPath` wins, then the repository's own
/// git directory, then the common directory (which is where a linked worktree
/// finds the shared hooks).
pub fn hooks_dir(repo: &Repository) -> PathBuf {
    if let Ok(config) = repo.config() {
        if let Ok(custom) = config.get_string("core.hooksPath") {
            if !custom.trim().is_empty() {
                let p = PathBuf::from(&custom);
                // A relative core.hooksPath is resolved against the working
                // directory, matching git's own behaviour.
                return if p.is_absolute() {
                    p
                } else {
                    repo.workdir().unwrap_or_else(|| repo.path()).join(p)
                };
            }
        }
    }

    let local = repo.path().join("hooks");
    if local.is_dir() {
        return local;
    }
    repo.commondir().join("hooks")
}

/// Locate an executable hook by name, or `None` when it is absent or not
/// executable (git ignores non-executable hook files).
pub fn find_hook(repo: &Repository, name: &str) -> Option<PathBuf> {
    let candidate = hooks_dir(repo).join(name);
    if !candidate.is_file() {
        return None;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let executable = std::fs::metadata(&candidate)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
        if !executable {
            return None;
        }
    }

    Some(candidate)
}

/// Run a hook, returning its combined output.
///
/// `workdir` is the directory the hook runs in — git always invokes hooks from
/// the top of the working tree.
pub fn run_hook(
    repo: &Repository,
    workdir: &Path,
    name: &str,
    args: &[&str],
) -> Result<HookOutput, AppError> {
    let Some(hook_path) = find_hook(repo, name) else {
        return Ok(HookOutput {
            ran: false,
            success: true,
            combined_output: String::new(),
        });
    };

    let mut cmd = crate::commands::new_command(&hook_path.to_string_lossy());
    cmd.current_dir(workdir);
    cmd.args(args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Hooks commonly shell out to git; GIT_DIR must point at this repository
    // rather than being inherited from whatever launched the app.
    cmd.env("GIT_DIR", repo.path());
    if let Some(wd) = repo.workdir() {
        cmd.env("GIT_WORK_TREE", wd);
    }

    let output = cmd
        .output()
        .map_err(|e| AppError::command(format!("Failed to run {} hook: {}", name, e)))?;

    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    Ok(HookOutput {
        ran: true,
        success: output.status.success(),
        combined_output: combined,
    })
}

/// Run a hook whose failure must abort the operation.
pub fn run_blocking_hook(
    repo: &Repository,
    workdir: &Path,
    name: &str,
    args: &[&str],
) -> Result<(), AppError> {
    let result = run_hook(repo, workdir, name, args)?;
    if result.ran && !result.success {
        return Err(AppError::command(format!(
            "The {} hook rejected this commit:\n{}",
            name,
            result.combined_output.trim()
        )));
    }
    Ok(())
}

/// Path git uses to hand a commit message to hooks.
pub fn commit_msg_path(repo: &Repository) -> PathBuf {
    repo.path().join("COMMIT_EDITMSG")
}

/// Strip comment lines the way git does before using an edited message.
///
/// `commit-msg` hooks may rewrite the file wholesale, and some templates leave
/// `#`-prefixed guidance behind that must not end up in the commit.
pub fn strip_comments(message: &str) -> String {
    message
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
