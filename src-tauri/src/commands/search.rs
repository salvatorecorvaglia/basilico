/* ═══════════════════════════════════════════════════════
Basilico — Search Commands
Command handlers for git history and code search
═══════════════════════════════════════════════════════ */

use crate::error::AppError;
use crate::git::graph::GraphCommit;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    pub file_path: String,
    pub line_number: usize,
    pub content: String,
}

fn run_git_log(repo_path: &str, args: &[&str]) -> Result<Vec<GraphCommit>, AppError> {
    let output = crate::commands::new_command("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git log: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() >= 9 {
            let oid = parts[0].to_string();
            let short_oid = parts[1].to_string();
            let message = parts[2].to_string();
            let author_name = parts[3].to_string();
            let author_email = parts[4].to_string();
            let author_date = parts[5].parse::<i64>().unwrap_or(0);
            let committer_name = parts[6].to_string();
            let committer_date = parts[7].parse::<i64>().unwrap_or(0);
            let parents_str = parts[8];
            let parent_oids: Vec<String> = if parents_str.is_empty() {
                Vec::new()
            } else {
                parents_str
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect()
            };

            commits.push(GraphCommit {
                oid,
                short_oid,
                message,
                author_name,
                author_email,
                author_date,
                committer_name,
                committer_date,
                parent_oids,
                refs: Vec::new(),
                lane: 0,
                edges: Vec::new(),
            });
        }
    }

    Ok(commits)
}

#[tauri::command]
pub async fn search_commits(
    repo_path: String,
    query: String,
) -> Result<Vec<GraphCommit>, AppError> {
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return run_git_log(
            &repo_path,
            &[
                "log",
                "--all",
                "-n",
                "200",
                "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
            ],
        );
    }

    let mut msg_commits = run_git_log(
        &repo_path,
        &[
            "log",
            "--all",
            "--grep",
            query_trimmed,
            "-i",
            "-n",
            "200",
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
        ],
    )?;

    let author_commits = run_git_log(
        &repo_path,
        &[
            "log",
            "--all",
            "--author",
            query_trimmed,
            "-i",
            "-n",
            "200",
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
        ],
    )?;

    msg_commits.extend(author_commits);

    let mut seen = std::collections::HashSet::new();
    let mut unique_commits = Vec::new();
    for c in msg_commits {
        if seen.insert(c.oid.clone()) {
            unique_commits.push(c);
        }
    }

    unique_commits.sort_by_key(|b| std::cmp::Reverse(b.author_date));
    unique_commits.truncate(200);

    Ok(unique_commits)
}

#[tauri::command]
pub async fn grep_code(repo_path: String, query: String) -> Result<Vec<GrepMatch>, AppError> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let output = crate::commands::new_command("git")
        .current_dir(&repo_path)
        .args([
            "grep",
            "-n",
            "-I",
            "--no-color",
            "--fixed-strings",
            "-e",
            &query,
        ])
        .output()
        .map_err(|e| AppError::command(format!("Failed to run git grep: {}", e)))?;

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
