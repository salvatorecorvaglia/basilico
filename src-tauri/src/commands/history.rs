use crate::error::AppError;
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
) -> Result<Vec<FileHistoryEntry>, AppError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&path)?;
        let mut walk = repo.revwalk()?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;

        // Start walk from HEAD. If HEAD does not exist (empty repo), return empty list.
        if walk.push_head().is_err() {
            return Ok(Vec::new());
        }

        let limit = max_commits.unwrap_or(100);
        let mut history = Vec::new();
        let mut current_path = file_path.clone();

        for oid_res in walk {
            let oid = oid_res?;
            let commit = repo.find_commit(oid)?;

            // 1. Get commit tree
            let commit_tree = commit.tree()?;

            // 2. Compare with parents to see if this commit modified the file at current_path
            let parents_count = commit.parent_count();
            let mut modified = false;
            let mut renamed_path = None;

            if parents_count == 0 {
                // Root commit: it added the file if it exists in the tree
                if commit_tree
                    .get_path(std::path::Path::new(&current_path))
                    .is_ok()
                {
                    modified = true;
                }
            } else {
                // Check diff against parents
                for p_idx in 0..parents_count {
                    let parent = commit.parent(p_idx)?;
                    let parent_tree = parent.tree()?;

                    // Generate diff with rename detection
                    let mut diff =
                        repo.diff_tree_to_tree(Some(&parent_tree), Some(&commit_tree), None)?;

                    let mut find_opts = git2::DiffFindOptions::new();
                    find_opts.renames(true);
                    diff.find_similar(Some(&mut find_opts))?;

                    for delta_idx in 0..diff.deltas().len() {
                        if let Some(delta) = diff.get_delta(delta_idx) {
                            let new_file_path =
                                delta.new_file().path().and_then(|p| p.to_str());
                            let old_file_path =
                                delta.old_file().path().and_then(|p| p.to_str());

                            let matches_new =
                                new_file_path.map(|p| p == current_path).unwrap_or(false);
                            let matches_old =
                                old_file_path.map(|p| p == current_path).unwrap_or(false);

                            if matches_new || matches_old {
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
    })
    .await
    .map_err(|e| AppError::unknown(format!("Task join error: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[tokio::test]
    async fn test_file_history_deletions() {
        let repo = TempRepo::new();

        // 1. Create file and commit
        repo.write_file("test.txt", "hello");
        repo.commit("initial");

        // 2. Modify and commit
        repo.write_file("test.txt", "hello world");
        repo.commit("modify");

        // 3. Delete and commit
        repo.remove_file("test.txt");
        repo.commit("delete file");

        // 4. Recreate and commit
        repo.write_file("test.txt", "reborn file");
        repo.commit("recreate");

        let history = get_file_history(repo.path_str().to_string(), "test.txt".to_string(), None)
            .await
            .unwrap();

        // Should contain all 4 stages: recreate, delete file, modify, initial
        assert_eq!(history.len(), 4);
        assert_eq!(history[0].commit_summary, "recreate");
        assert_eq!(history[1].commit_summary, "delete file");
        assert_eq!(history[2].commit_summary, "modify");
        assert_eq!(history[3].commit_summary, "initial");
    }
}
