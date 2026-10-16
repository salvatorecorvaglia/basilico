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
    /// The subject line, as shown and edited in the UI.
    pub summary: String,
    /// The commit's full original message. Rewording or squashing only
    /// replaces the subject; without this the body was silently dropped,
    /// because `summary` was all the plan carried.
    #[serde(default)]
    pub message: String,
}

/// Where an interactive rebase stands. Serialised lowercase: "none",
/// "conflict", "edit", "finished".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RebasePhase {
    /// No rebase in progress (e.g. after an abort).
    None,
    /// Stopped on conflicts.
    Conflict,
    /// Stopped on an `edit` step, or another non-conflict stop.
    Edit,
    Finished,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStatus {
    pub status: RebasePhase,
    pub current_oid: Option<String>,
    pub message: Option<String>,
}

/// Where Basilico stores the todo body handed to `GIT_SEQUENCE_EDITOR`.
fn plan_path(repo: &Repository) -> PathBuf {
    repo.path().join("basilico-rebase-plan")
}

/// A JSON copy of the plan that earlier versions wrote on every edit and
/// never read back. Nothing writes it any more; it is still removed during
/// cleanup so repositories that have one are left tidy.
fn plan_json_path(repo: &Repository) -> PathBuf {
    plan_path(repo).with_extension("json")
}

/// Remove both plan artefacts once a rebase has finished or been abandoned.
fn remove_plan_files(repo: &Repository) {
    let _ = fs::remove_file(plan_path(repo));
    let _ = fs::remove_file(plan_json_path(repo));
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
/// * `reword` → `pick` followed by `exec git commit --amend --file=…`, with
///   the edited subject over the commit's original body
/// * `squash` → `fixup` (which drops the message) plus the same amend. The
///   combined message is both messages, as git writes it, or — when the user
///   edited the subject — that subject over both bodies
///
/// `drop` is expressed by omitting the commit entirely.
fn build_todo(items: &[RebaseTodoItem], msg_dir: &Path) -> Result<String, AppError> {
    let mut todo = String::new();
    let mut wrote_any = false;
    // The message of the commit a `squash` folds into: the previous kept
    // commit's message, as rewritten by any reword or squash before it.
    let mut previous_message = String::new();

    let write_message = |todo: &mut String, idx: usize, message: &str| -> Result<(), AppError> {
        let msg_file = msg_dir.join(format!("{}.msg", idx));
        fs::write(&msg_file, message)?;
        todo.push_str(&format!(
            "exec git commit --amend --file={}\n",
            shell_quote(&msg_file.to_string_lossy())
        ));
        Ok(())
    };

    for (idx, item) in items.iter().enumerate() {
        validate_oid(&item.oid)?;

        let action = item.action.to_lowercase();
        if action == "drop" || action == "d" {
            continue;
        }

        let short = item.oid.as_str();
        // A client that predates `message` sends only the summary.
        let original = if item.message.trim().is_empty() {
            item.summary.clone()
        } else {
            item.message.clone()
        };

        match action.as_str() {
            "reword" | "r" => {
                todo.push_str(&format!("pick {}\n", short));
                let reworded = compose_message(&item.summary, &[message_body(&original)]);
                write_message(&mut todo, idx, &reworded)?;
                previous_message = reworded;
            }
            "squash" | "s" => {
                // `fixup` keeps the base commit's message; the amend below then
                // replaces it with the combined message.
                todo.push_str(&format!("fixup {}\n", short));
                let edited = item.summary.trim() != message_subject(&original);
                let combined = if edited {
                    // The user wrote a new subject for the combined commit; keep
                    // both bodies under it.
                    compose_message(
                        &item.summary,
                        &[message_body(&previous_message), message_body(&original)],
                    )
                } else {
                    // git's default: both messages, one after the other.
                    join_messages(&previous_message, &original)
                };
                write_message(&mut todo, idx, &combined)?;
                previous_message = combined;
            }
            "fixup" | "f" => {
                todo.push_str(&format!("fixup {}\n", short));
            }
            "edit" | "e" => {
                todo.push_str(&format!("edit {}\n", short));
                previous_message = original;
            }
            _ => {
                todo.push_str(&format!("pick {}\n", short));
                previous_message = original;
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

/// The first line of a commit message.
fn message_subject(message: &str) -> &str {
    message.lines().next().unwrap_or("").trim()
}

/// Everything after the subject line, without the separating blank lines.
fn message_body(message: &str) -> &str {
    message
        .split_once('\n')
        .map(|(_, rest)| rest)
        .unwrap_or("")
        .trim()
}

/// `subject`, then the non-empty `bodies` separated by blank lines.
fn compose_message(subject: &str, bodies: &[&str]) -> String {
    let mut message = subject.trim().to_string();
    let body = bodies
        .iter()
        .map(|b| b.trim())
        .filter(|b| !b.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if !body.is_empty() {
        message.push_str("\n\n");
        message.push_str(&body);
    }
    message.push('\n');
    message
}

/// Two whole messages, the way `git rebase` combines a squash by default.
fn join_messages(first: &str, second: &str) -> String {
    let (first, second) = (first.trim(), second.trim());
    match (first.is_empty(), second.is_empty()) {
        (true, _) => format!("{}\n", second),
        (false, true) => format!("{}\n", first),
        (false, false) => format!("{}\n\n{}\n", first, second),
    }
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
            status: RebasePhase::Finished,
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
            status: RebasePhase::Conflict,
            current_oid: head_oid,
            message: Some(
                "Conflicts detected. Resolve them in the staging area, then continue.".to_string(),
            ),
        });
    }

    Ok(RebaseStatus {
        status: RebasePhase::Edit,
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
    crate::state::ensure_open_repo(&repo_path)?;
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
            // `git rebase -i` (without --rebase-merges) drops merge commits
            // from the todo; listing them offered actions git would ignore,
            // and `pick <merge>` makes git stop with an error.
            if commit.parent_count() > 1 {
                continue;
            }
            items.push(RebaseTodoItem {
                action: "pick".to_string(),
                oid: oid.to_string(),
                summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
                message: commit.message().unwrap_or("").to_string(),
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

/// Begin the rebase, handing `items` to git as the todo list.
#[tauri::command]
pub async fn rebase_start(
    repo_path: String,
    upstream: String,
    items: Vec<RebaseTodoItem>,
) -> Result<RebaseStatus, AppError> {
    crate::state::ensure_open_repo(&repo_path)?;
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
    crate::state::ensure_open_repo(&repo_path)?;
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
            remove_plan_files(&repo);

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(AppError::git(format!("Rebase abort failed: {}", stderr)));
            }
            return Ok(RebaseStatus {
                status: RebasePhase::None,
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

        if status.status == RebasePhase::Finished {
            let _ = fs::remove_dir_all(message_dir(&repo));
            remove_plan_files(&repo);
        }

        Ok(status)
    })
    .await?
}

#[cfg(test)]
mod rebase_phase_tests {
    use super::RebasePhase;

    /// `RebaseStatus.status` on the frontend compares against these strings.
    #[test]
    fn serialises_to_the_frontend_strings() {
        for (phase, name) in [
            (RebasePhase::None, "none"),
            (RebasePhase::Conflict, "conflict"),
            (RebasePhase::Edit, "edit"),
            (RebasePhase::Finished, "finished"),
        ] {
            assert_eq!(
                serde_json::to_string(&phase).unwrap(),
                format!("\"{}\"", name)
            );
        }
    }
}
