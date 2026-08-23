use crate::error::AppError;
use crate::git::helpers::get_or_fallback_signature;
use crate::git::hooks;
use git2::{Repository, Signature};
use serde::Serialize;

#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
    amend: bool,
    bypass_hooks: bool,
) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let hook_workdir = repo.workdir().unwrap_or_else(|| repo.path()).to_path_buf();

        // Hook lifecycle, in the order git runs it:
        //   pre-commit → prepare-commit-msg → commit-msg → (commit) → post-commit
        // `commit-msg` may rewrite the message file, so the final message is
        // read back from disk rather than assumed to be what we wrote.
        let mut message = message;

        if !bypass_hooks {
            hooks::run_blocking_hook(&repo, &hook_workdir, "pre-commit", &[])?;

            let msg_path = hooks::commit_msg_path(&repo);
            std::fs::write(&msg_path, &message)?;
            let msg_path_str = msg_path.to_string_lossy().to_string();

            // "message" is the source git reports when a message was supplied
            // up front rather than composed in an editor.
            hooks::run_blocking_hook(
                &repo,
                &hook_workdir,
                "prepare-commit-msg",
                &[&msg_path_str, "message"],
            )?;

            hooks::run_blocking_hook(&repo, &hook_workdir, "commit-msg", &[&msg_path_str])?;

            let edited = std::fs::read_to_string(&msg_path)?;
            let edited = hooks::strip_comments(&edited);
            if edited.is_empty() {
                return Err(AppError::invalid_state(
                    "The commit message is empty after running hooks. Aborting the commit.",
                ));
            }
            message = edited;
        }

        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // Get committer signature (user's git config identity)
        let committer_sig = get_or_fallback_signature(&repo)?;

        // Create author signature. When amending without an explicit override,
        // the original author is preserved — `git commit --amend` keeps
        // authorship, and rewriting it would silently reassign someone else's
        // commit to the current user.
        let explicit_author = match (author_name, author_email) {
            (Some(name), Some(email)) => Some(Signature::now(&name, &email)?),
            _ => None,
        };

        let sig = match explicit_author {
            Some(s) => s,
            None if amend => repo
                .head()
                .ok()
                .and_then(|h| h.peel_to_commit().ok())
                .map(|c| c.author().to_owned())
                .unwrap_or_else(|| committer_sig.clone()),
            None => committer_sig.clone(),
        };

        // Determine parents
        let mut parents = Vec::new();
        if amend {
            if let Ok(head_ref) = repo.head() {
                if let Ok(commit_to_amend) = head_ref.peel_to_commit() {
                    for parent in commit_to_amend.parents() {
                        parents.push(parent);
                    }
                }
            }
        } else {
            if let Ok(head_ref) = repo.head() {
                if let Ok(parent_commit) = head_ref.peel_to_commit() {
                    parents.push(parent_commit);
                }
            }

            if repo.find_reference("MERGE_HEAD").is_ok() {
                if let Ok(merge_ref) = repo.find_reference("MERGE_HEAD") {
                    if let Ok(merge_commit) = merge_ref.peel_to_commit() {
                        parents.push(merge_commit);
                    }
                }
            }
        }

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let (should_sign, signing_key) = crate::git::helpers::signing_config(&repo);

        let commit_id = if should_sign {
            // GPG sign commit
            let commit_content_buf =
                repo.commit_create_buffer(&sig, &committer_sig, &message, &tree, &parent_refs)?;
            let commit_content = std::str::from_utf8(&commit_content_buf)
                .map_err(|_| AppError::invalid_state("Commit buffer is not valid UTF-8"))?;

            let signature = crate::git::helpers::gpg_sign(commit_content, signing_key.as_deref())?;
            let commit_oid = repo.commit_signed(commit_content, &signature, Some("gpgsig"))?;

            // The reflog file is one entry per line; a multi-line commit
            // message would otherwise corrupt it, so mirror the summary-only
            // reflog message `repo.commit()` builds automatically for the
            // unsigned path below.
            let reflog_summary = message.lines().next().unwrap_or_default();

            // Update HEAD
            let head_ref = repo.head();
            match head_ref {
                Ok(head) => {
                    if head.is_branch() {
                        if let Ok(refname) = head.name() {
                            let mut r = repo.find_reference(refname)?;
                            r.set_target(
                                commit_oid,
                                &format!("commit (signed): {}", reflog_summary),
                            )?;
                            repo.set_head(refname)?;
                        }
                    } else {
                        repo.set_head_detached(commit_oid)?;
                    }
                }
                Err(_) => {
                    // This might be the initial commit in an empty repo.
                    // Resolve where HEAD points symbolically (e.g. refs/heads/main)
                    if let Ok(head_sym) = repo.find_reference("HEAD") {
                        if let Ok(Some(target)) = head_sym.symbolic_target() {
                            // Create the target reference pointing to the new commit
                            repo.reference(
                                target,
                                commit_oid,
                                true,
                                &format!("commit (signed): {}", reflog_summary),
                            )?;
                            repo.set_head(target)?;
                        } else {
                            repo.set_head_detached(commit_oid)?;
                        }
                    } else {
                        repo.set_head_detached(commit_oid)?;
                    }
                }
            }

            if !amend && repo.find_reference("MERGE_HEAD").is_ok() {
                let _ = repo.cleanup_state();
            }

            commit_oid
        } else {
            // Unsigned commit
            if amend {
                let head_ref = repo.head()?;
                let commit_to_amend = head_ref.peel_to_commit()?;
                // Author and committer are distinct: the committer is always
                // whoever is performing the rewrite.
                commit_to_amend.amend(
                    Some("HEAD"),
                    Some(&sig),
                    Some(&committer_sig),
                    None,
                    Some(&message),
                    Some(&tree),
                )?
            } else {
                let has_merge_head = repo.find_reference("MERGE_HEAD").is_ok();
                let commit_oid = repo.commit(
                    Some("HEAD"),
                    &sig,
                    &committer_sig,
                    &message,
                    &tree,
                    &parent_refs,
                )?;

                if has_merge_head {
                    let _ = repo.cleanup_state();
                }
                commit_oid
            }
        };

        // post-commit is informational: git ignores its exit status, and a
        // failing notification hook must not make a successful commit look
        // like it failed.
        if !bypass_hooks {
            match hooks::run_hook(&repo, &hook_workdir, "post-commit", &[]) {
                Ok(result) if result.ran && !result.success => {
                    log::warn!("post-commit hook failed: {}", result.combined_output.trim());
                }
                Err(e) => log::warn!("post-commit hook could not be run: {}", e),
                _ => {}
            }
        }

        Ok(commit_id.to_string())
    })
    .await?
}

#[tauri::command]
pub async fn cherry_pick_commit(path: String, oid: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        // Validate OID format to prevent command line option/argument injection
        let _ = git2::Oid::from_str(&oid)?;

        let args = ["cherry-pick", oid.as_str()];
        let output = crate::commands::git_output(&args, &path)?;

        let repo = Repository::open(&path)?;
        match repo.state() {
            git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
                Ok("conflicts".to_string())
            }
            _ => {
                if output.status.success() {
                    Ok("success".to_string())
                } else {
                    Err(AppError::git(crate::commands::git_failure_message(
                        &args, &output,
                    )))
                }
            }
        }
    })
    .await?
}

#[tauri::command]
pub async fn cherry_pick_abort(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        crate::commands::run_git_cmd(&["cherry-pick", "--abort"], &path)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn revert_commit(path: String, oid: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        // Validate OID format to prevent command line option/argument injection
        let _ = git2::Oid::from_str(&oid)?;

        let args = ["revert", "--no-edit", oid.as_str()];
        let output = crate::commands::git_output(&args, &path)?;

        let repo = Repository::open(&path)?;
        match repo.state() {
            git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => {
                Ok("conflicts".to_string())
            }
            _ => {
                if output.status.success() {
                    Ok("success".to_string())
                } else {
                    Err(AppError::git(crate::commands::git_failure_message(
                        &args, &output,
                    )))
                }
            }
        }
    })
    .await?
}

#[tauri::command]
pub async fn revert_abort(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        crate::commands::run_git_cmd(&["revert", "--abort"], &path)?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn reset_to_commit(path: String, oid: String, mode: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        // Peel rather than downcast: a tag or a ref resolves to a tag object,
        // which `as_commit` rejects outright.
        let commit = repo.revparse_single(&oid)?.peel_to_commit().map_err(|_| {
            AppError::invalid_state(format!("'{}' does not resolve to a commit", oid))
        })?;

        let reset_type = match mode.as_str() {
            "soft" => git2::ResetType::Soft,
            "mixed" => git2::ResetType::Mixed,
            "hard" => git2::ResetType::Hard,
            _ => {
                return Err(AppError::invalid_state(format!(
                    "Invalid reset mode: {}",
                    mode
                )))
            }
        };

        repo.reset(commit.as_object(), reset_type, None)?;
        Ok(())
    })
    .await?
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntryInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
pub async fn get_commit_tree(path: String, oid: String) -> Result<Vec<TreeEntryInfo>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let commit = repo.revparse_single(&oid)?.peel_to_commit().map_err(|_| {
            AppError::invalid_state(format!("'{}' does not resolve to a commit", oid))
        })?;
        let tree = commit.tree()?;

        let mut entries = Vec::new();
        tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
            let name = entry.name().unwrap_or("").to_string();
            let rel_path = if root.is_empty() {
                name.clone()
            } else {
                format!("{}{}", root, name)
            };

            let is_dir = entry.kind() == Some(git2::ObjectType::Tree);
            let size = None;

            entries.push(TreeEntryInfo {
                path: rel_path,
                name,
                is_dir,
                size,
            });

            git2::TreeWalkResult::Ok
        })?;

        Ok(entries)
    })
    .await?
}
