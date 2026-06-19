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
) -> Result<Vec<BlameLine>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    // 1. Get file content at the specified revision or HEAD/workdir
    let (content, resolved_oid) = if let Some(ref oid_str) = commit_oid {
        let obj = repo.revparse_single(oid_str).map_err(|e| e.to_string())?;
        let commit = obj.as_commit().ok_or_else(|| "Not a commit".to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let entry = tree.get_path(Path::new(&file_path)).map_err(|e| e.to_string())?;
        let object = entry.to_object(&repo).map_err(|e| e.to_string())?;
        let blob = object.as_blob().ok_or_else(|| "Not a blob".to_string())?;
        (String::from_utf8_lossy(blob.content()).to_string(), Some(commit.id()))
    } else {
        // Read from workdir
        let text = std::fs::read_to_string(Path::new(&path).join(&file_path))
            .map_err(|e| format!("Failed to read file from workdir: {}", e))?;
        (text, None)
    };

    // 2. Initialize blame options
    let mut blame_opts = git2::BlameOptions::new();
    if let Some(oid) = resolved_oid {
        blame_opts.newest_commit(oid);
    }

    // 3. Compute blame
    let blame = repo.blame_file(Path::new(&file_path), Some(&mut blame_opts))
        .map_err(|e| e.to_string())?;

    // 4. Align lines with hunks
    let lines: Vec<&str> = content.lines().collect();
    let mut blame_lines = Vec::new();
    let mut commit_cache = HashMap::new();

    for (idx, line_content) in lines.iter().enumerate() {
        let line_no = idx + 1; // 1-based index
        if let Some(hunk) = blame.get_line(line_no) {
            let final_oid = hunk.final_commit_id();
            let final_oid_str = final_oid.to_string();
            let short_oid = if final_oid_str.len() >= 8 {
                final_oid_str[..8].to_string()
            } else {
                final_oid_str.clone()
            };

            // Fetch commit details (caching to avoid disk requests)
            let (author_name, author_email, summary) = if let Some(cached) = commit_cache.get(&final_oid) {
                cached
            } else {
                let (name, email, summ) = if let Ok(commit) = repo.find_commit(final_oid) {
                    let sig = commit.author();
                    let name = sig.name().unwrap_or("Unknown").to_string();
                    let email = sig.email().unwrap_or("").to_string();
                    let summary = commit.summary().unwrap_or("").to_string();
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
        } else {
            blame_lines.push(BlameLine {
                line_no,
                commit_oid: "".to_string(),
                short_oid: "".to_string(),
                author_name: "Unknown".to_string(),
                author_email: "".to_string(),
                commit_summary: "".to_string(),
                line_content: line_content.to_string(),
            });
        }
    }

    Ok(blame_lines)
}
