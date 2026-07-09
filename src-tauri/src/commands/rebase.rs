/* ═══════════════════════════════════════════════════════
Basilico — Rebase Commands
Command handlers for git rebase operations
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use git2::{RebaseOptions, Repository};
use serde::{Deserialize, Serialize};
use std::fs;

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
    pub status: String, // "none", "success", "conflict", "stepping", "finished"
    pub current_oid: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn rebase_init(
    repo_path: String,
    upstream: String,
) -> Result<Vec<RebaseTodoItem>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;

        let mut rebase = if let Ok(r) = repo.open_rebase(None) {
            r
        } else {
            let upstream_obj = repo.revparse_single(&upstream)?;
            let upstream_commit = repo.find_annotated_commit(upstream_obj.id())?;

            let mut opts = RebaseOptions::new();
            repo.rebase(None, Some(&upstream_commit), None, Some(&mut opts))?
        };

        let mut items = Vec::new();
        let count = rebase.len();
        for i in 0..count {
            if let Some(op) = rebase.nth(i) {
                let oid = op.id();
                let summary = repo
                    .find_commit(oid)
                    .map(|c| c.summary().unwrap_or("").to_string())
                    .unwrap_or_default();

                let action = match op.kind().unwrap_or(git2::RebaseOperationType::Pick) {
                    git2::RebaseOperationType::Pick => "pick",
                    git2::RebaseOperationType::Reword => "reword",
                    git2::RebaseOperationType::Edit => "edit",
                    git2::RebaseOperationType::Squash => "squash",
                    git2::RebaseOperationType::Fixup => "fixup",
                    git2::RebaseOperationType::Exec => "exec",
                }
                .to_string();

                items.push(RebaseTodoItem {
                    action,
                    oid: oid.to_string(),
                    summary,
                });
            }
        }

        Ok(items)
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[tauri::command]
pub async fn rebase_write_todo(
    repo_path: String,
    items: Vec<RebaseTodoItem>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let todo_path = repo.path().join("rebase-merge/git-rebase-todo");

        let mut content = String::new();
        for item in items {
            let short_oid = if item.oid.len() >= 7 {
                &item.oid[0..7]
            } else {
                &item.oid
            };
            content.push_str(&format!("{} {} {}\n", item.action, short_oid, item.summary));
        }

        fs::write(todo_path, content)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

fn get_todo_action(repo: &Repository, idx: usize) -> Result<String, AppError> {
    let todo_path = repo.path().join("rebase-merge/git-rebase-todo");
    if !todo_path.exists() {
        return Ok("pick".to_string());
    }
    let content = fs::read_to_string(todo_path)?;
    let mut instruction_lines = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        instruction_lines.push(trimmed);
    }

    if idx < instruction_lines.len() {
        let line = instruction_lines[idx];
        let parts: Vec<&str> = line.split_whitespace().collect();
        if !parts.is_empty() {
            return Ok(parts[0].to_lowercase());
        }
    }

    Ok("pick".to_string())
}

#[tauri::command]
pub async fn rebase_step(
    repo_path: String,
    action: String,
    commit_message: Option<String>,
) -> Result<RebaseStatus, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let mut rebase = repo.open_rebase(None)?;

        let signature = repo.signature().map_err(|_| {
            AppError::invalid_state(
                "Git author name and email are not configured. \
                 Please set them in Settings or via 'git config user.name' and 'git config user.email'.",
            )
        })?;

        if action == "abort" {
            rebase.abort()?;
            return Ok(RebaseStatus {
                status: "none".to_string(),
                current_oid: None,
                message: Some("Rebase aborted".to_string()),
            });
        }

        if action == "skip" {
            let head = repo.head()?;
            let commit = head.peel_to_commit()?;
            let obj = commit.into_object();
            let mut opts = git2::build::CheckoutBuilder::new();
            opts.force();
            repo.checkout_tree(&obj, Some(&mut opts))?;
        }

        if action == "continue" {
            let index = repo.index()?;
            if index.has_conflicts() {
                return Err(AppError::conflict(
                    "Cannot continue rebase while there are merge conflicts.",
                ));
            }

            let current_idx = rebase.operation_current().unwrap_or(0);
            let action_name = get_todo_action(&repo, current_idx)?;

            let commit_oid = rebase.commit(None, &signature, commit_message.as_deref())?;

            if action_name == "fixup" || action_name == "f" {
                let commit_c = repo.find_commit(commit_oid)?;
                if let Ok(commit_b) = commit_c.parent(0) {
                    let tree = commit_c.tree()?;
                    let msg = commit_b.message().map(|m| m.to_string());
                    let amended_oid = commit_b.amend(
                        None,
                        None,
                        Some(&signature),
                        None,
                        msg.as_deref(),
                        Some(&tree),
                    )?;
                    repo.set_head_detached(amended_oid)?;
                }
            } else if action_name == "squash" || action_name == "s" {
                let commit_c = repo.find_commit(commit_oid)?;
                if let Ok(commit_b) = commit_c.parent(0) {
                    let tree = commit_c.tree()?;
                    let msg_b = commit_b.message().unwrap_or("");
                    let msg_c = commit_c.message().unwrap_or("");
                    let combined_msg = format!("{}\n\n{}", msg_b.trim(), msg_c.trim());
                    let amended_oid = commit_b.amend(
                        None,
                        None,
                        Some(&signature),
                        None,
                        Some(&combined_msg),
                        Some(&tree),
                    )?;
                    repo.set_head_detached(amended_oid)?;

                    return Ok(RebaseStatus {
                        status: "reword".to_string(),
                        current_oid: Some(amended_oid.to_string()),
                        message: Some(format!("Paused for squash message edit at commit {}", amended_oid)),
                    });
                }
            }
        }

        loop {
            let next_op = match rebase.next() {
                Some(Ok(op)) => op,
                None => {
                    rebase.finish(None)?;
                    return Ok(RebaseStatus {
                        status: "finished".to_string(),
                        current_oid: None,
                        message: Some("Rebase completed successfully".to_string()),
                    });
                }
                Some(Err(e)) => return Err(AppError::from(e)),
            };

            let oid = next_op.id();
            let index = repo.index()?;
            if index.has_conflicts() {
                return Ok(RebaseStatus {
                    status: "conflict".to_string(),
                    current_oid: Some(oid.to_string()),
                    message: Some(format!("Conflict at commit {}", oid)),
                });
            }

            let current_idx = rebase.operation_current().unwrap_or(0);
            let action_name = get_todo_action(&repo, current_idx)?;

            match action_name.as_str() {
                "edit" | "e" => {
                    return Ok(RebaseStatus {
                        status: "edit".to_string(),
                        current_oid: Some(oid.to_string()),
                        message: Some(format!("Paused for editing at commit {}", oid)),
                    });
                }
                "reword" | "r" => {
                    return Ok(RebaseStatus {
                        status: "reword".to_string(),
                        current_oid: Some(oid.to_string()),
                        message: Some(format!("Paused for rewording at commit {}", oid)),
                    });
                }
                "fixup" | "f" => {
                    let commit_oid = rebase.commit(None, &signature, None)?;
                    let commit_c = repo.find_commit(commit_oid)?;
                    if let Ok(commit_b) = commit_c.parent(0) {
                        let tree = commit_c.tree()?;
                        let msg = commit_b.message().map(|m| m.to_string());
                        let amended_oid = commit_b.amend(
                            None,
                            None,
                            Some(&signature),
                            None,
                            msg.as_deref(),
                            Some(&tree),
                        )?;
                        repo.set_head_detached(amended_oid)?;
                    }
                }
                "squash" | "s" => {
                    let commit_oid = rebase.commit(None, &signature, None)?;
                    let commit_c = repo.find_commit(commit_oid)?;
                    if let Ok(commit_b) = commit_c.parent(0) {
                        let tree = commit_c.tree()?;
                        let msg_b = commit_b.message().unwrap_or("");
                        let msg_c = commit_c.message().unwrap_or("");
                        let combined_msg = format!("{}\n\n{}", msg_b.trim(), msg_c.trim());
                        let amended_oid = commit_b.amend(
                            None,
                            None,
                            Some(&signature),
                            None,
                            Some(&combined_msg),
                            Some(&tree),
                        )?;
                        repo.set_head_detached(amended_oid)?;

                        return Ok(RebaseStatus {
                            status: "reword".to_string(),
                            current_oid: Some(amended_oid.to_string()),
                            message: Some(format!("Paused for squash message edit at commit {}", amended_oid)),
                        });
                    }
                }
                "drop" | "d" => {
                    let commit_oid = rebase.commit(None, &signature, None)?;
                    let commit_c = repo.find_commit(commit_oid)?;
                    if let Ok(commit_b) = commit_c.parent(0) {
                        repo.set_head_detached(commit_b.id())?;
                        let mut opts = git2::build::CheckoutBuilder::new();
                        opts.force();
                        repo.checkout_tree(&commit_b.into_object(), Some(&mut opts))?;
                    }
                }
                _ => {
                    // Pick, Exec: auto commit and loop
                    rebase.commit(None, &signature, None)?;
                }
            }
        }
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[tokio::test]
    async fn test_rebase_init_and_write_todo() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello");
        repo.commit("initial commit");

        // Save main branch ref or base oid
        let base_oid = repo.repo.head().unwrap().target().unwrap();

        // Create new branch and commit on it
        crate::commands::branch::create_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
            None,
        )
        .await
        .unwrap();
        crate::commands::branch::checkout_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
        )
        .await
        .unwrap();

        repo.write_file("test2.txt", "hello 2");
        repo.commit("commit 2");

        repo.write_file("test3.txt", "hello 3");
        repo.commit("commit 3");

        // Initialize rebase of branch1 onto initial commit
        let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
            .await
            .unwrap();

        // We should have 2 commits to rebase (commit 2 and commit 3)
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0].action, "pick");
        assert_eq!(todos[1].action, "pick");

        // Write modified todo list (e.g. changing the first action to "edit")
        let mut modified_todos = todos.clone();
        modified_todos[0].action = "edit".to_string();

        rebase_write_todo(repo.path_str().to_string(), modified_todos)
            .await
            .unwrap();

        // Read it back by opening rebase to verify
        let rebase = repo.repo.open_rebase(None).unwrap();
        assert_eq!(rebase.len(), 2);
    }

    #[tokio::test]
    async fn test_rebase_step_loop() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "initial");
        repo.commit("initial");

        let base_oid = repo.repo.head().unwrap().target().unwrap();

        crate::commands::branch::create_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
            None,
        )
        .await
        .unwrap();
        crate::commands::branch::checkout_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
        )
        .await
        .unwrap();

        repo.write_file("test2.txt", "hello 2");
        repo.commit("commit 2");

        repo.write_file("test3.txt", "hello 3");
        repo.commit("commit 3");

        let _todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
            .await
            .unwrap();

        let status = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
            .await
            .unwrap();

        assert_eq!(status.status, "finished");
    }

    #[tokio::test]
    async fn test_rebase_step_squash_and_fixup() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "initial");
        repo.commit("initial");

        let base_oid = repo.repo.head().unwrap().target().unwrap();

        crate::commands::branch::create_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
            None,
        )
        .await
        .unwrap();
        crate::commands::branch::checkout_branch(
            repo.path_str().to_string(),
            "branch1".to_string(),
        )
        .await
        .unwrap();

        repo.write_file("test.txt", "initial\ncommit 2");
        repo.commit("commit 2");

        repo.write_file("test.txt", "initial\ncommit 2\ncommit 3");
        repo.commit("commit 3");

        // Init rebase branch1 onto initial
        let todos = rebase_init(repo.path_str().to_string(), base_oid.to_string())
            .await
            .unwrap();
        assert_eq!(todos.len(), 2);

        // Modify todo: make the second commit a fixup
        let mut modified_todos = todos.clone();
        modified_todos[1].action = "fixup".to_string(); // squash/fixup commit 3 into commit 2

        rebase_write_todo(repo.path_str().to_string(), modified_todos)
            .await
            .unwrap();
        // Step rebase: first step applies commit 2 (pick), then immediately fixup and finish!
        let status = rebase_step(repo.path_str().to_string(), "none".to_string(), None)
            .await
            .unwrap();
        assert_eq!(status.status, "finished");

        // Verify HEAD is pointing to the squashed commit
        let head_commit = repo.repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head_commit.parent_count(), 1);
        assert_eq!(head_commit.parent(0).unwrap().id(), base_oid);
        // The message should be commit 2 (since it was fixup, keeping message of parent)
        assert_eq!(head_commit.message().unwrap().trim(), "commit 2");
        // The content should be the combined content
        let content = std::fs::read_to_string(repo.path.join("test.txt")).unwrap();
        assert_eq!(content, "initial\ncommit 2\ncommit 3");
    }
}
