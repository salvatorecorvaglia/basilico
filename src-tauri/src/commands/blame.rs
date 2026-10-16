use crate::error::AppError;
use git2::Repository;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_no: usize,
    pub commit_oid: String,
    pub short_oid: String,
    pub author_name: String,
    pub author_email: String,
    pub commit_summary: String,
    pub line_content: String,
}

#[tauri::command]
pub async fn get_file_blame(
    path: String,
    file_path: String,
    commit_oid: Option<String>,
) -> Result<Vec<BlameLine>, AppError> {
    crate::state::ensure_open_repo(&path)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;

        // Validate file_path
        let workdir = repo
            .workdir()
            .ok_or_else(|| AppError::invalid_state("Repository has no working directory"))?;
        // Read below via `fs::read_to_string`, which follows symlinks.
        let validated_full_path =
            crate::git::utils::validate_path_no_symlink(workdir, Path::new(&file_path))?;

        // 1. Get file content at the specified revision or HEAD/workdir
        let (content, resolved_oid) = if let Some(ref oid_str) = commit_oid {
            // Peel rather than downcast: a tag resolves to a tag object, which
            // `as_commit` rejected outright.
            let commit = repo
                .revparse_single(oid_str)?
                .peel_to_commit()
                .map_err(|_| AppError::invalid_state(format!("'{}' is not a commit", oid_str)))?;
            let tree = commit.tree()?;
            let entry = tree.get_path(Path::new(&file_path))?;
            let object = entry.to_object(&repo)?;
            let blob = object
                .as_blob()
                .ok_or_else(|| AppError::invalid_state("Not a blob"))?;
            (
                String::from_utf8_lossy(blob.content()).to_string(),
                Some(commit.id()),
            )
        } else {
            // Read from workdir
            let text = std::fs::read_to_string(&validated_full_path)
                .map_err(|e| AppError::io(format!("Failed to read file from workdir: {}", e)))?;
            (text, None)
        };

        // 2. Initialize blame options
        let mut blame_opts = git2::BlameOptions::new();
        if let Some(oid) = resolved_oid {
            blame_opts.newest_commit(oid);
        }

        // 3. Compute blame
        let blame = match repo.blame_file(Path::new(&file_path), Some(&mut blame_opts)) {
            Ok(b) => Some(b),
            Err(e) => {
                if e.code() == git2::ErrorCode::NotFound {
                    None
                } else {
                    return Err(AppError::from(e));
                }
            }
        };

        // Blaming the working tree: `blame_file` describes the *committed*
        // file, but the lines shown are the working-tree file's. Any local
        // edit shifted every line below it onto the wrong commit. Blaming the
        // buffer itself maps committed lines through the edit, and reports
        // lines that exist only locally with a zero commit id.
        let buffer_blame = match (&blame, resolved_oid) {
            (Some(b), None) => b.blame_buffer(content.as_bytes()).ok(),
            _ => None,
        };
        let effective_blame = buffer_blame.as_ref().or(blame.as_ref());

        // 4. Align lines with hunks
        let lines: Vec<&str> = content.lines().collect();
        let mut blame_lines = Vec::new();
        let mut commit_cache = HashMap::new();

        for (idx, line_content) in lines.iter().enumerate() {
            let line_no = idx + 1; // 1-based index
            let mut resolved = false;

            if let Some(b) = effective_blame {
                if let Some(hunk) = b
                    .get_line(line_no)
                    .filter(|hunk| !hunk.final_commit_id().is_zero())
                {
                    let final_oid = hunk.final_commit_id();
                    let final_oid_str = final_oid.to_string();
                    let short_oid = if final_oid_str.len() >= 8 {
                        final_oid_str[..8].to_string()
                    } else {
                        final_oid_str.clone()
                    };

                    // Fetch commit details (caching to avoid disk requests)
                    let (author_name, author_email, summary) = if let Some(cached) =
                        commit_cache.get(&final_oid)
                    {
                        cached
                    } else {
                        let (name, email, summ) = if let Ok(commit) = repo.find_commit(final_oid) {
                            let sig = commit.author();
                            let name = sig.name().unwrap_or("Unknown").to_string();
                            let email = sig.email().unwrap_or("").to_string();
                            let summary = commit.summary().ok().flatten().unwrap_or("").to_string();
                            (name, email, summary)
                        } else {
                            ("Unknown".to_string(), "".to_string(), "".to_string())
                        };
                        commit_cache.insert(final_oid, (name.clone(), email.clone(), summ.clone()));
                        commit_cache.get(&final_oid).unwrap()
                    };

                    blame_lines.push(BlameLine {
                        line_no,
                        commit_oid: final_oid_str,
                        short_oid,
                        author_name: author_name.clone(),
                        author_email: author_email.clone(),
                        commit_summary: summary.clone(),
                        line_content: line_content.to_string(),
                    });
                    resolved = true;
                }
            }

            if !resolved {
                blame_lines.push(BlameLine {
                    line_no,
                    commit_oid: "".to_string(),
                    short_oid: "".to_string(),
                    author_name: "Not Committed Yet".to_string(),
                    author_email: "".to_string(),
                    commit_summary: "Local modifications".to_string(),
                    line_content: line_content.to_string(),
                });
            }
        }

        Ok(blame_lines)
    })
    .await?
}
