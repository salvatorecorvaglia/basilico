/* ═══════════════════════════════════════════════════════
Basilico — Rebase Commands
Command handlers for git rebase operations
═══════════════════════════════════════════════════════ */

//! Interactive rebase is driven by `git rebase -i` rather than libgit2.
//!
//! libgit2 builds its operation list when the rebase is created and stores it
//! as `cmt.N` files, hardcoded to "pick"; it never reads `git-rebase-todo`.
//! Rewriting that file therefore had no effect on the order commits were
//! applied in, while the per-step action was still looked up *by index* in the
//! rewritten file — so after a reorder, `drop`/`squash`/`fixup` were applied to
//! the wrong commits.
//!
//! Handing the plan to git itself makes reordering, dropping and squashing
//! behave exactly as they do on the command line. The plan is passed to git
//! through `GIT_SEQUENCE_EDITOR` via an environment variable, so no
//! user-controlled path is ever interpolated into a shell string.

use crate::error::AppError;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodoItem {
    pub action: String, // "pick", "reword", "edit", "squash", "fixup", "drop"
    pub oid: String,
    pub summary: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStatus {
    pub status: String, // "none", "conflict", "edit", "finished"
    pub current_oid: Option<String>,
    pub message: Option<String>,
}

/// Where Basilico stores the todo body handed to `GIT_SEQUENCE_EDITOR`.
fn plan_path(repo: &Repository) -> PathBuf {
    repo.path().join("basilico-rebase-plan")
}

/// Directory holding commit messages referenced by `exec ... --file=`.
fn message_dir(repo: &Repository) -> PathBuf {
    repo.path().join("basilico-rebase-messages")
}

/// Quote a path for use inside a shell command in the rebase todo file.
///
/// `exec` lines are executed by the shell, so a repository path containing a
/// space or a quote would otherwise split into multiple arguments.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Confirm `oid` is a well-formed, plain hex commit id.
///
/// `oid` is written verbatim into a line of the `git-rebase-todo` file that
/// `git rebase -i` parses one line at a time. A value that isn't strictly hex
/// digits — in particular one containing a newline — could inject an
/// additional todo line (including an `exec` line git would run). Every
/// caller today sources `oid` from our own `revwalk()`, but this validates
/// the IPC boundary itself rather than relying on that being true forever.
fn validate_oid(oid: &str) -> Result<(), AppError> {
    if oid.is_empty() || oid.len() > 40 || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(AppError::invalid_state(
            "Rebase plan contains an invalid commit id.",
        ));
    }
    Ok(())
}

/// Render the git todo body for `items`.
///
/// Actions that ordinarily require an interactive editor are expressed without
/// one, so nothing can block waiting on input:
///
/// * `reword` → `pick` followed by `exec git commit --amend --file=…`
/// * `squash` → `fixup` (which drops the message) plus the same amend, using
///   the summary the user edited in the UI
///
/// `drop` is expressed by omitting the commit entirely.
fn build_todo(items: &[RebaseTodoItem], msg_dir: &Path) -> Result<String, AppError> {
    let mut todo = String::new();
    let mut wrote_any = false;

    for (idx, item) in items.iter().enumerate() {
        validate_oid(&item.oid)?;

        let action = item.action.to_lowercase();
        if action == "drop" || action == "d" {
            continue;
        }

        let short = item.oid.as_str();

        match action.as_str() {
            "reword" | "r" => {
                todo.push_str(&format!("pick {}\n", short));
                let msg_file = msg_dir.join(format!("{}.msg", idx));
                fs::write(&msg_file, format!("{}\n", item.summary.trim()))?;
                todo.push_str(&format!(
                    "exec git commit --amend --file={}\n",
                    shell_quote(&msg_file.to_string_lossy())
                ));
            }
            "squash" | "s" => {
                // `fixup` keeps the base commit's message; the amend below then
                // replaces it with the combined message the user chose.
                todo.push_str(&format!("fixup {}\n", short));
                let msg_file = msg_dir.join(format!("{}.msg", idx));
                fs::write(&msg_file, format!("{}\n", item.summary.trim()))?;
                todo.push_str(&format!(
                    "exec git commit --amend --file={}\n",
                    shell_quote(&msg_file.to_string_lossy())
                ));
            }
            "fixup" | "f" => {
                todo.push_str(&format!("fixup {}\n", short));
            }
            "edit" | "e" => {
                todo.push_str(&format!("edit {}\n", short));
            }
            _ => {
                todo.push_str(&format!("pick {}\n", short));
            }
        }

        wrote_any = true;
    }

    if !wrote_any {
        return Err(AppError::invalid_state(
            "The rebase plan drops every commit. Keep at least one commit, or abort instead.",
        ));
    }

    Ok(todo)
}

/// Run a git command with the sequence editor bound to our plan file.
fn run_rebase_command(
    repo_path: &str,
    args: &[&str],
    plan: Option<&Path>,
) -> Result<std::process::Output, AppError> {
    let mut cmd = crate::commands::new_command("git");
    cmd.current_dir(repo_path);
    cmd.args(args);

    if let Some(plan) = plan {
        // The plan path travels in the environment, never inside the command
        // string, so spaces and quotes in the repository path are harmless.
        cmd.env("BASILICO_REBASE_PLAN", plan);
        cmd.env(
            "GIT_SEQUENCE_EDITOR",
            r#"sh -c 'cat "$BASILICO_REBASE_PLAN" > "$1"' --"#,
        );
    }

    // Nothing may block on an interactive editor: every message this flow needs
    // is supplied up front via `exec ... --file=`.
    cmd.env("GIT_EDITOR", "true");

    cmd.output()
        .map_err(|e| AppError::command(format!("Failed to run git {:?}: {}", args, e)))
}

/// Inspect on-disk state to describe where the rebase stopped.
fn current_status(
    repo_path: &str,
    output: &std::process::Output,
) -> Result<RebaseStatus, AppError> {
    let repo = Repository::open(repo_path)?;
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let in_progress = matches!(
        repo.state(),
        git2::RepositoryState::Rebase
            | git2::RepositoryState::RebaseInteractive
            | git2::RepositoryState::RebaseMerge
    );

    if !in_progress {
        if !output.status.success() {
            return Err(AppError::git(if stderr.is_empty() {
                stdout
            } else {
                stderr
            }));
        }
        return Ok(RebaseStatus {
            status: "finished".to_string(),
            current_oid: None,
            message: Some("Rebase completed successfully".to_string()),
        });
    }

    let head_oid = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .map(|o| o.to_string());
    let has_conflicts = repo.index().map(|i| i.has_conflicts()).unwrap_or(false);

    if has_conflicts {
        return Ok(RebaseStatus {
            status: "conflict".to_string(),
            current_oid: head_oid,
            message: Some(
                "Conflicts detected. Resolve them in the staging area, then continue.".to_string(),
            ),
        });
    }

    Ok(RebaseStatus {
        status: "edit".to_string(),
        current_oid: head_oid,
        message: Some(if stderr.is_empty() {
            "Rebase paused. Make your changes, then continue.".to_string()
        } else {
            stderr
        }),
    })
}

/// Build the rebase plan for `upstream..HEAD` *without* touching repository state.
///
/// Opening the editor must not leave the repository mid-rebase — the previous
/// implementation started one here, so cancelling the dialog stranded the repo.
#[tauri::command]
pub async fn rebase_init(
    repo_path: String,
    upstream: String,
) -> Result<Vec<RebaseTodoItem>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;

        let upstream_obj = repo.revparse_single(&upstream)?;
        let upstream_commit = upstream_obj.peel_to_commit()?;

        let head_commit = repo.head()?.peel_to_commit()?;

        let mut revwalk = repo.revwalk()?;
        revwalk.push(head_commit.id())?;
        revwalk.hide(upstream_commit.id())?;

        let mut items = Vec::new();
        for oid in revwalk {
            let oid = oid?;
            let commit = repo.find_commit(oid)?;
            items.push(RebaseTodoItem {
                action: "pick".to_string(),
                oid: oid.to_string(),
                summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
            });
        }

        // A revwalk yields newest first; git applies the todo top-down, oldest
        // first, and the UI mirrors that order.
        items.reverse();

        if items.is_empty() {
            return Err(AppError::invalid_state(format!(
                "There are no commits between {} and HEAD to rebase.",
                upstream
            )));
        }

        Ok(items)
    })
    .await?
}

/// Persist the plan the user assembled. Repository state is untouched until
/// [`rebase_start`] runs.
#[tauri::command]
pub async fn rebase_write_todo(
    repo_path: String,
    items: Vec<RebaseTodoItem>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let json = serde_json::to_string(&items)?;
        fs::write(plan_path(&repo).with_extension("json"), json)?;
        Ok(())
    })
    .await?
}

/// Begin the rebase, handing `items` to git as the todo list.
#[tauri::command]
pub async fn rebase_start(
    repo_path: String,
    upstream: String,
    items: Vec<RebaseTodoItem>,
) -> Result<RebaseStatus, AppError> {
    // `upstream` lands in a positional argv slot right after `-i`, where a value
    // such as `--exec=<cmd>` would be read by git as a flag that runs an
    // arbitrary command after every replayed commit.
    crate::commands::validate_git_argument(&upstream, "Upstream revision")?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;

        if repo.state() != git2::RepositoryState::Clean {
            return Err(AppError::invalid_state(
                "The repository already has an operation in progress. \
                 Finish or abort it before starting a rebase.",
            ));
        }

        let msg_dir = message_dir(&repo);
        let _ = fs::remove_dir_all(&msg_dir);
        fs::create_dir_all(&msg_dir)?;

        let todo = build_todo(&items, &msg_dir)?;
        let plan = plan_path(&repo);
        fs::write(&plan, &todo)?;

        let output = run_rebase_command(&repo_path, &["rebase", "-i", &upstream], Some(&plan))?;
        current_status(&repo_path, &output)
    })
    .await?
}

/// Advance an in-progress rebase: `continue`, `skip` or `abort`.
#[tauri::command]
pub async fn rebase_step(
    repo_path: String,
    action: String,
    commit_message: Option<String>,
) -> Result<RebaseStatus, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;

        let git_arg = match action.as_str() {
            "continue" => "--continue",
            "skip" => "--skip",
            "abort" => "--abort",
            other => {
                return Err(AppError::invalid_state(format!(
                    "Unsupported rebase action: {}",
                    other
                )))
            }
        };

        if git_arg == "--abort" {
            let output = run_rebase_command(&repo_path, &["rebase", "--abort"], None)?;
            let _ = fs::remove_dir_all(message_dir(&repo));
            let _ = fs::remove_file(plan_path(&repo));

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(AppError::git(format!("Rebase abort failed: {}", stderr)));
            }
            return Ok(RebaseStatus {
                status: "none".to_string(),
                current_oid: None,
                message: Some("Rebase aborted".to_string()),
            });
        }

        // An edited message supplied at continue-time amends the paused commit
        // before handing control back to git.
        if git_arg == "--continue" {
            if let Some(msg) = commit_message
                .as_ref()
                .map(|m| m.trim())
                .filter(|m| !m.is_empty())
            {
                let msg_dir = message_dir(&repo);
                fs::create_dir_all(&msg_dir)?;
                let msg_file = msg_dir.join("continue.msg");
                fs::write(&msg_file, format!("{}\n", msg))?;

                let amend = run_rebase_command(
                    &repo_path,
                    &["commit", "--amend", "--file", &msg_file.to_string_lossy()],
                    None,
                )?;
                if !amend.status.success() {
                    let stderr = String::from_utf8_lossy(&amend.stderr).trim().to_string();
                    return Err(AppError::git(format!(
                        "Failed to amend message: {}",
                        stderr
                    )));
                }
            }
        }

        let output = run_rebase_command(&repo_path, &["rebase", git_arg], None)?;
        let status = current_status(&repo_path, &output)?;

        if status.status == "finished" {
            let _ = fs::remove_dir_all(message_dir(&repo));
            let _ = fs::remove_file(plan_path(&repo));
        }

        Ok(status)
    })
    .await?
}
