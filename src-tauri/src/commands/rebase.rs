/* ═══════════════════════════════════════════════════════
Basilico — Rebase Commands
Command handlers for git rebase operations
═══════════════════════════════════════════════════════ */

use git2::{RebaseOptions, Repository, Signature};
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
) -> Result<Vec<RebaseTodoItem>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

    let mut rebase = if let Ok(r) = repo.open_rebase(None) {
        r
    } else {
        let upstream_obj = repo.revparse_single(&upstream).map_err(|e| e.to_string())?;
        let upstream_commit = repo
            .find_annotated_commit(upstream_obj.id())
            .map_err(|e| e.to_string())?;

        let mut opts = RebaseOptions::new();
        repo.rebase(None, Some(&upstream_commit), None, Some(&mut opts))
            .map_err(|e| e.to_string())?
    };

    let mut items = Vec::new();
    while let Some(op_result) = rebase.next() {
        if let Ok(op) = op_result {
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
}

#[tauri::command]
pub async fn rebase_write_todo(
    repo_path: String,
    items: Vec<RebaseTodoItem>,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
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

    fs::write(todo_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rebase_step(repo_path: String, action: String) -> Result<RebaseStatus, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let mut rebase = repo.open_rebase(None).map_err(|e| e.to_string())?;

    let signature = repo
        .signature()
        .unwrap_or_else(|_| Signature::now("Basilico User", "user@basilico.io").unwrap());

    if action == "abort" {
        rebase.abort().map_err(|e| e.to_string())?;
        return Ok(RebaseStatus {
            status: "none".to_string(),
            current_oid: None,
            message: Some("Rebase aborted".to_string()),
        });
    }

    if action == "continue" {
        let index = repo.index().map_err(|e| e.to_string())?;
        if index.has_conflicts() {
            return Err("Cannot continue rebase while there are merge conflicts.".to_string());
        }
        let _ = rebase.commit(None, &signature, None);
    }

    let next_oid = match rebase.next() {
        Some(Ok(op)) => Some(op.id()),
        None => None,
        Some(Err(e)) => return Err(e.to_string()),
    };

    let status = match next_oid {
        Some(oid) => {
            let index = repo.index().map_err(|e| e.to_string())?;
            if index.has_conflicts() {
                RebaseStatus {
                    status: "conflict".to_string(),
                    current_oid: Some(oid.to_string()),
                    message: Some(format!("Conflict at commit {}", oid)),
                }
            } else {
                match rebase.commit(None, &signature, None) {
                    Ok(_) => RebaseStatus {
                        status: "stepping".to_string(),
                        current_oid: Some(oid.to_string()),
                        message: Some(format!("Applied commit {}", oid)),
                    },
                    Err(e) => RebaseStatus {
                        status: "stepping".to_string(),
                        current_oid: Some(oid.to_string()),
                        message: Some(format!("Applied commit {} ({})", oid, e)),
                    },
                }
            }
        }
        None => {
            rebase.finish(None).map_err(|e| e.to_string())?;
            RebaseStatus {
                status: "finished".to_string(),
                current_oid: None,
                message: Some("Rebase completed successfully".to_string()),
            }
        }
    };

    Ok(status)
}
