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
    pub truncated: bool,
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
    let mut retained_bytes = 0usize;

    for line in stdout.lines() {
        retained_bytes += line.len().saturating_mul(6) + 512;
        if retained_bytes > 2 * 1024 * 1024 {
            return Err(AppError::invalid_state(
                "Commit search exceeds the display budget. Narrow your query.",
            ));
        }
        if line.len() > 16 * 1024 {
            return Err(AppError::invalid_state(
                "Commit search record exceeds the 16 KB display limit.",
            ));
        }
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
    crate::state::ensure_open_repo(&repo_path)?;
    validate_query(&query)?;
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
                // The query is plain text typed into a search box. As a regex,
                // `fix(` or `[WIP` made git error out instead of matching.
                "--fixed-strings",
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
                "--fixed-strings",
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

/// Ceiling on returned `git grep` matches. Beyond this the list stops being
/// navigable, and the cost is paid in IPC serialisation and DOM nodes.
const GREP_MATCH_LIMIT: usize = 2_000;

#[tauri::command]
pub async fn grep_code(repo_path: String, query: String) -> Result<Vec<GrepMatch>, AppError> {
    crate::state::ensure_open_repo(&repo_path)?;
    validate_query(&query)?;
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    tokio::task::spawn_blocking(move || {
        use std::io::Read;

        let args = [
            "grep",
            "-n",
            "-z",
            "-I",
            "--no-color",
            "--fixed-strings",
            "-e",
            query.as_str(),
        ];

        // Streamed rather than collected with `output()`: a broad query over a
        // large repository can produce hundreds of megabytes, all of which was
        // buffered (and decoded) before being cut down to the limit below.
        // Reading line by line lets git be stopped as soon as enough matches
        // have arrived.
        let child = crate::commands::new_command("git")
            .current_dir(&repo_path)
            .args(args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| AppError::command(format!("Failed to execute git grep: {}", e)))?;

        let mut child = SearchChild(child);

        // Drained on its own thread so a chatty stderr can never fill its pipe
        // and stall git while this thread waits on stdout.
        let stderr = child.stderr.take();
        let stderr_reader = std::thread::spawn(move || {
            let mut text = String::new();
            if let Some(mut stderr) = stderr {
                let _ = stderr.by_ref().take(16 * 1024).read_to_string(&mut text);
                let _ = std::io::copy(&mut stderr, &mut std::io::sink());
            }
            text
        });

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::command("Search output unavailable"))?;
        let (tx, rx) = std::sync::mpsc::channel();
        let reader = std::thread::spawn(move || {
            let _ = tx.send((|| {
                let mut matches: Vec<GrepMatch> = Vec::new();
                let mut truncated = false;
                let mut retained_bytes = 0usize;
                {
                    let mut reader = std::io::BufReader::new(stdout);
                    loop {
                        // -z separates both path and line number with NUL: colons,
                        // tabs, quotes and even newlines in filenames remain literal.
                        let path = read_field(&mut reader, 0, 16 * 1024)?;
                        if path.is_empty() {
                            break;
                        }
                        let number = read_field(&mut reader, 0, 32)?;
                        let raw = read_field(&mut reader, b'\n', 16 * 1024)?;
                        let file_path = String::from_utf8(path).map_err(|_| {
                            AppError::invalid_state("Search cannot navigate non-UTF-8 filenames")
                        })?;
                        let line_number = String::from_utf8_lossy(&number)
                            .parse::<usize>()
                            .map_err(|_| AppError::git("Invalid git grep line number"))?;
                        let content = String::from_utf8_lossy(&raw)
                            .trim_end_matches('\r')
                            .to_string();
                        retained_bytes += 6 * (file_path.len() + content.len()) + 128;
                        if matches.len() >= GREP_MATCH_LIMIT || retained_bytes > 1024 * 1024 {
                            truncated = true;
                            break;
                        }
                        matches.push(GrepMatch {
                            file_path,
                            line_number,
                            content,
                            truncated: false,
                        });
                    }
                }
                if truncated {
                    if let Some(last) = matches.last_mut() {
                        last.truncated = true;
                    }
                }

                Ok::<_, AppError>((matches, truncated))
            })());
        });
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        let result = loop {
            match rx.recv_timeout(std::time::Duration::from_millis(20)) {
                Ok(result) => break result,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break Err(AppError::command("Search reader stopped"))
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
                    if std::time::Instant::now() >= deadline =>
                {
                    break Err(AppError::command("Search timed out. Narrow your query."))
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            }
        };
        if result.is_err() {
            let _ = child.kill();
        }
        let _ = reader.join();
        let (matches, truncated) = match result {
            Ok(result) => result,
            Err(error) => {
                let _ = child.wait();
                let _ = stderr_reader.join();
                return Err(error);
            }
        };

        if truncated {
            // Enough results: stop git instead of letting it scan the rest.
            let _ = child.kill();
        }
        let status = child
            .wait()
            .map_err(|e| AppError::command(format!("Failed to wait for git grep: {}", e)))?;
        let stderr_text = stderr_reader.join().unwrap_or_default();

        // `git grep` exits 1 when there are simply no matches; anything above
        // that is a real failure that must not be reported to the user as "no
        // results". A run stopped on purpose is not a failure.
        if !truncated && !matches!(status.code(), Some(0) | Some(1)) {
            let detail = stderr_text.trim();
            return Err(AppError::git(if detail.is_empty() {
                format!("git {:?} failed with no output", args)
            } else {
                format!("git {:?} failed: {}", args, detail)
            }));
        }

        Ok(matches)
    })
    .await?
}

/// A search may stop on a malformed or oversized record; always reap git then.
struct SearchChild(std::process::Child);
impl std::ops::Deref for SearchChild {
    type Target = std::process::Child;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl std::ops::DerefMut for SearchChild {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for SearchChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn read_field(
    reader: &mut impl std::io::BufRead,
    delimiter: u8,
    limit: usize,
) -> Result<Vec<u8>, AppError> {
    use std::io::{BufRead, Read};
    let mut field = Vec::new();
    let count = reader
        .take(limit as u64 + 1)
        .read_until(delimiter, &mut field)
        .map_err(|e| AppError::io(e.to_string()))?;
    if count > limit {
        return Err(AppError::invalid_state("Search record exceeds the 16 KB display limit. Narrow your query or use an external search tool."));
    }
    if field.last() == Some(&delimiter) {
        field.pop();
    }
    Ok(field)
}

fn validate_query(query: &str) -> Result<(), AppError> {
    if query.len() > 4096 || query.contains('\0') {
        Err(AppError::invalid_state(
            "Search query must contain at most 4 KB of text and no NUL characters.",
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod bounded_search_tests {
    use super::*;
    #[test]
    fn nul_fields_preserve_unusual_filenames_and_bound_single_lines() {
        let mut input = std::io::Cursor::new(b"a:12:b\nfile\0".to_vec());
        assert_eq!(read_field(&mut input, 0, 100).unwrap(), b"a:12:b\nfile");
        assert!(read_field(&mut std::io::Cursor::new(vec![b'x'; 100]), b'\n', 16).is_err());
    }
}
