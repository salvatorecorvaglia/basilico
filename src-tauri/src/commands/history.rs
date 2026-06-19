use git2::{Repository, Sort};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub commit_oid: String,
    pub short_oid: String,
    pub author_name: String,
    pub author_email: String,
    pub author_date: i64,
    pub commit_summary: String,
    pub file_path: String,
}

#[tauri::command]
pub async fn get_file_history(
    path: String,
    file_path: String,
    max_commits: Option<usize>,
) -> Result<Vec<FileHistoryEntry>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;

    // Start walk from HEAD. If HEAD does not exist (empty repo), return empty list.
    if walk.push_head().is_err() {
        return Ok(Vec::new());
    }

    let limit = max_commits.unwrap_or(100);
    let mut history = Vec::new();
    let mut current_path = file_path.clone();

    for oid_res in walk {
        let oid = oid_res.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;

        // 1. Get commit tree
        let commit_tree = commit.tree().map_err(|e| e.to_string())?;

        // 2. Check if file existed at current_path in this commit
        let file_exists = commit_tree
            .get_path(std::path::Path::new(&current_path))
            .is_ok();
        if !file_exists {
            continue;
        }

        // 3. Compare with parents to see if this commit modified the file at current_path
        let parents_count = commit.parent_count();
        let mut modified = false;
        let mut renamed_path = None;

        if parents_count == 0 {
            // Root commit: it added the file, so it's a modification
            modified = true;
        } else {
            // Check diff against parents
            for p_idx in 0..parents_count {
                let parent = commit.parent(p_idx).map_err(|e| e.to_string())?;
                let parent_tree = parent.tree().map_err(|e| e.to_string())?;

                // Generate diff with rename detection
                let mut diff = repo
                    .diff_tree_to_tree(Some(&parent_tree), Some(&commit_tree), None)
                    .map_err(|e| e.to_string())?;

                let mut find_opts = git2::DiffFindOptions::new();
                find_opts.renames(true);
                diff.find_similar(Some(&mut find_opts))
                    .map_err(|e| e.to_string())?;

                for delta_idx in 0..diff.deltas().len() {
                    if let Some(delta) = diff.get_delta(delta_idx) {
                        let new_file_path = delta.new_file().path().and_then(|p| p.to_str());
                        let old_file_path = delta.old_file().path().and_then(|p| p.to_str());

                        if let Some(n_path) = new_file_path {
                            if n_path == current_path {
                                modified = true;
                                if delta.status() == git2::Delta::Renamed {
                                    if let Some(o_path) = old_file_path {
                                        renamed_path = Some(o_path.to_string());
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                if modified {
                    break;
                }
            }
        }

        if modified {
            let sig = commit.author();
            history.push(FileHistoryEntry {
                commit_oid: oid.to_string(),
                short_oid: oid.to_string()[..8].to_string(),
                author_name: sig.name().unwrap_or("Unknown").to_string(),
                author_email: sig.email().unwrap_or("").to_string(),
                author_date: sig.when().seconds(),
                commit_summary: commit.summary().unwrap_or("").to_string(),
                file_path: current_path.clone(),
            });

            // If it was renamed in this commit, track its old name for parents
            if let Some(old_p) = renamed_path {
                current_path = old_p;
            }

            if history.len() >= limit {
                break;
            }
        }
    }

    Ok(history)
}
