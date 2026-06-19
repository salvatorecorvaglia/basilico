/* ═══════════════════════════════════════════════════════
Basilico — Search Commands
Command handlers for git history and code search
═══════════════════════════════════════════════════════ */

use crate::git::graph::GraphCommit;
use git2::{Repository, Sort};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    pub file_path: String,
    pub line_number: usize,
    pub content: String,
}

#[tauri::command]
pub async fn search_commits(repo_path: String, query: String) -> Result<Vec<GraphCommit>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;

    // Push head to revwalk
    if let Ok(_) = repo.head() {
        let _ = revwalk.push_head();
    }

    // Also push refs
    if let Ok(references) = repo.references() {
        for reference in references {
            if let Ok(r) = reference {
                if let Some(oid) = r.target() {
                    let _ = revwalk.push(oid);
                }
            }
        }
    }

    let mut matches = Vec::new();
    let query_lower = query.to_lowercase();

    for oid_result in revwalk {
        let oid = match oid_result {
            Ok(o) => o,
            Err(_) => continue,
        };

        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let message = commit.message().unwrap_or("");
        let author = commit.author();
        let author_name = author.name().unwrap_or("");

        if message.to_lowercase().contains(&query_lower)
            || author_name.to_lowercase().contains(&query_lower)
        {
            let parent_oids: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
            let committer = commit.committer();

            matches.push(GraphCommit {
                oid: oid.to_string(),
                short_oid: oid.to_string()[..7.min(oid.to_string().len())].to_string(),
                message: message.lines().next().unwrap_or("").to_string(),
                author_name: author_name.to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                author_date: author.when().seconds(),
                committer_name: committer.name().unwrap_or("").to_string(),
                committer_date: committer.when().seconds(),
                parent_oids,
                refs: Vec::new(),
                lane: 0,
                edges: Vec::new(),
            });
        }

        if matches.len() >= 200 {
            break;
        }
    }

    Ok(matches)
}

#[tauri::command]
pub async fn grep_code(repo_path: String, query: String) -> Result<Vec<GrepMatch>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let output = crate::commands::new_command("git")
        .current_dir(&repo_path)
        .args(&["grep", "-n", "-I", "--no-color", "-e", &query])
        .output()
        .map_err(|e| format!("Failed to run git grep: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut matches = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() == 3 {
            let file_path = parts[0].to_string();
            if let Ok(line_number) = parts[1].parse::<usize>() {
                let content = parts[2].to_string();
                matches.push(GrepMatch {
                    file_path,
                    line_number,
                    content,
                });
            }
        }
    }

    Ok(matches)
}
