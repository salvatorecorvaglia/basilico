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
    let output = crate::commands::git_output(args, repo_path)?;

    if !output.status.success() {
        return Err(AppError::git(crate::commands::git_failure_message(
            args, &output,
        )));
    }

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
    let query_trimmed = query.trim().to_string();

    if query_trimmed.is_empty() {
        let repo_path = repo_path.clone();
        return tokio::task::spawn_blocking(move || {
            run_git_log(
                &repo_path,
                &[
                    "log",
                    "--all",
                    "-n",
                    "200",
                    "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
                ],
            )
        })
        .await?;
    }

    // Message and author are separate `git log` filters that AND together, so
    // matching "either" requires two invocations. Each is a blocking
    // subprocess call, so they are run on their own blocking-pool threads
    // rather than one after another on the same one — the actual git
    // processes then run concurrently instead of doubling wall-clock latency.
    let msg_repo_path = repo_path.clone();
    let msg_query = query_trimmed.clone();
    let msg_task = tokio::task::spawn_blocking(move || {
        run_git_log(
            &msg_repo_path,
            &[
                "log",
                "--all",
                "--grep",
                &msg_query,
                "-i",
                "-n",
                "200",
                "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
            ],
        )
    });

    let author_repo_path = repo_path.clone();
    let author_query = query_trimmed.clone();
    let author_task = tokio::task::spawn_blocking(move || {
        run_git_log(
            &author_repo_path,
            &[
                "log",
                "--all",
                "--author",
                &author_query,
                "-i",
                "-n",
                "200",
                "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%P",
            ],
        )
    });

    let (msg_result, author_result) = tokio::join!(msg_task, author_task);
    let mut msg_commits = msg_result??;
    let author_commits = author_result??;

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

/// Split one `git grep -n` output line into `(path, line_number, content)`.
///
/// The format is `<path>:<line>:<content>`, but `<path>` may itself contain
/// colons (`C:\repo\file.rs`, or a file literally named `a:b`). Scanning for the
/// first colon that is followed by digits and another colon identifies the real
/// separator.
pub fn split_grep_line(line: &str) -> Option<(String, usize, String)> {
    let mut search_from = 0;
    while let Some(rel) = line[search_from..].find(':') {
        let colon = search_from + rel;
        let rest = &line[colon + 1..];
        if let Some(next_rel) = rest.find(':') {
            let number_part = &rest[..next_rel];
            if !number_part.is_empty() {
                if let Ok(line_number) = number_part.parse::<usize>() {
                    return Some((
                        line[..colon].to_string(),
                        line_number,
                        rest[next_rel + 1..].to_string(),
                    ));
                }
            }
        }
        search_from = colon + 1;
    }
    None
}

/// Ceiling on returned `git grep` matches. Beyond this the list stops being
/// navigable, and the cost is paid in IPC serialisation and DOM nodes.
const GREP_MATCH_LIMIT: usize = 2_000;

#[tauri::command]
pub async fn grep_code(repo_path: String, query: String) -> Result<Vec<GrepMatch>, AppError> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    tokio::task::spawn_blocking(move || {
        let args = [
            "grep",
            "-n",
            "-I",
            "--no-color",
            "--fixed-strings",
            "-e",
            query.as_str(),
        ];
        let output = crate::commands::git_output(&args, &repo_path)?;

        // `git grep` exits 1 when there are simply no matches; anything above
        // that is a real failure that must not be reported to the user as "no
        // results".
        match output.status.code() {
            Some(0) | Some(1) => {}
            _ => {
                return Err(AppError::git(crate::commands::git_failure_message(
                    &args, &output,
                )));
            }
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        let mut matches = Vec::new();
        for line in stdout.lines() {
            // A broad query over a large repository can match hundreds of
            // thousands of lines; every one would be serialised over IPC and
            // rendered into an unwindowed list. Stop at a bound the UI can
            // actually show, matching the truncation the diff parser already does.
            if matches.len() >= GREP_MATCH_LIMIT {
                break;
            }
            // Paths may contain ':' (and always do on Windows), so anchor the split
            // on the line-number field rather than taking the first two colons.
            if let Some((file_path, line_number, content)) = split_grep_line(line) {
                matches.push(GrepMatch {
                    file_path,
                    line_number,
                    content,
                });
            }
        }

        Ok(matches)
    })
    .await?
}
