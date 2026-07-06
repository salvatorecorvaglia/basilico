use git2::{Diff, DiffFormat, DiffOptions, Repository};
use serde::Serialize;

use crate::error::AppError;

/// A parsed diff for a single file.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub hunks: Vec<DiffHunkInfo>,
    pub stats: DiffStats,
    pub is_binary: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunkInfo {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLineInfo>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLineInfo {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
}

/// Get the diff of the working directory vs index (unstaged changes).
pub fn get_workdir_diff(path: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;
    let mut opts = DiffOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))?;
    parse_diff(&diff)
}

/// Get the diff of the index vs HEAD (staged changes).
pub fn get_staged_diff(path: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;

    let head_tree = match repo.head() {
        Ok(head_ref) => Some(head_ref.peel_to_tree()?),
        Err(_) => None,
    };
    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?;
    parse_diff(&diff)
}

/// Get the diff for a specific commit.
pub fn get_commit_diff(path: &str, oid_str: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;
    let oid = git2::Oid::from_str(oid_str)?;
    let commit = repo.find_commit(oid)?;

    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    parse_diff(&diff)
}

/// Get the diff comparing two revisions.
pub fn get_compare_diff(path: &str, base: &str, target: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;
    let base_obj = repo.revparse_single(base)?;
    let target_obj = repo.revparse_single(target)?;

    let base_tree = base_obj.peel_to_tree()?;
    let target_tree = target_obj.peel_to_tree()?;

    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&target_tree), Some(&mut opts))?;
    parse_diff(&diff)
}

/// Get diff for a single file (staged or unstaged).
pub fn get_file_diff(path: &str, file_path: &str, is_staged: bool) -> Result<FileDiff, AppError> {
    let repo = Repository::open(path)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);

    let diff = if is_staged {
        if let Ok(head_ref) = repo.head() {
            if let Ok(head_tree) = head_ref.peel_to_tree() {
                repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))?
            } else {
                repo.diff_tree_to_index(None, None, Some(&mut opts))?
            }
        } else {
            repo.diff_tree_to_index(None, None, Some(&mut opts))?
        }
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };

    let files = parse_diff(&diff)?;
    files.into_iter().next().ok_or_else(|| AppError {
        message: format!("No diff found for file: {}", file_path),
        kind: crate::error::ErrorKind::NotFound,
    })
}

/// Parse a git2::Diff into structured FileDiff data.
pub fn parse_diff(diff: &Diff) -> Result<Vec<FileDiff>, AppError> {
    let mut files: Vec<FileDiff> = Vec::new();

    let num_deltas = diff.deltas().len();
    for delta_idx in 0..num_deltas {
        let delta = diff.get_delta(delta_idx).unwrap();
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Copied => "copied",
            git2::Delta::Typechange => "typechange",
            git2::Delta::Untracked => "untracked",
            git2::Delta::Ignored => "ignored",
            _ => "unknown",
        }
        .to_string();

        let is_binary = delta.flags().is_binary();

        files.push(FileDiff {
            old_path,
            new_path,
            status,
            hunks: Vec::new(),
            stats: DiffStats {
                additions: 0,
                deletions: 0,
            },
            is_binary,
        });
    }

    // Build a hashmap mapping path -> files index for fast lookup
    let mut file_map = std::collections::HashMap::new();
    for (i, f) in files.iter().enumerate() {
        if let Some(ref path) = f.new_path {
            file_map.insert(path.clone(), i);
        }
        if let Some(ref path) = f.old_path {
            file_map.insert(path.clone(), i);
        }
    }

    // Now walk the diff to populate hunks and lines
    diff.print(DiffFormat::Patch, |delta, hunk, line| {
        let file_path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string());

        // Find matching file
        let file_idx = file_path
            .as_ref()
            .and_then(|path| file_map.get(path).copied());

        if let Some(idx) = file_idx {
            // Truncate parsing if diff is too large
            let total_lines: usize = files[idx].hunks.iter().map(|h| h.lines.len()).sum();
            if total_lines > 5000 {
                let already_truncated = files[idx]
                    .hunks
                    .last()
                    .map(|h| h.header == "Truncated")
                    .unwrap_or(false);
                if !already_truncated {
                    files[idx].hunks.push(DiffHunkInfo {
                        header: "Truncated".to_string(),
                        old_start: 0,
                        old_lines: 0,
                        new_start: 0,
                        new_lines: 0,
                        lines: vec![DiffLineInfo {
                            origin: "info".to_string(),
                            content: "Diff truncated: too many lines to display.".to_string(),
                            old_lineno: None,
                            new_lineno: None,
                        }],
                    });
                }
                return true;
            }

            if let Some(hunk_info) = hunk {
                let header = String::from_utf8_lossy(hunk_info.header())
                    .trim()
                    .to_string();

                // Ensure hunk exists
                let hunk_exists = files[idx]
                    .hunks
                    .last()
                    .map(|h| {
                        h.old_start == hunk_info.old_start() && h.new_start == hunk_info.new_start()
                    })
                    .unwrap_or(false);

                if !hunk_exists {
                    files[idx].hunks.push(DiffHunkInfo {
                        header,
                        old_start: hunk_info.old_start(),
                        old_lines: hunk_info.old_lines(),
                        new_start: hunk_info.new_start(),
                        new_lines: hunk_info.new_lines(),
                        lines: Vec::new(),
                    });
                }

                // Skip hunk header lines from being added to the hunk's lines list
                if line.origin() == 'H' {
                    return true;
                }

                let origin = match line.origin() {
                    '+' => {
                        files[idx].stats.additions += 1;
                        "+".to_string()
                    }
                    '-' => {
                        files[idx].stats.deletions += 1;
                        "-".to_string()
                    }
                    ' ' => " ".to_string(),
                    _ => line.origin().to_string(),
                };

                let content = String::from_utf8_lossy(line.content()).to_string();

                if let Some(last_hunk) = files[idx].hunks.last_mut() {
                    last_hunk.lines.push(DiffLineInfo {
                        origin,
                        content,
                        old_lineno: line.old_lineno(),
                        new_lineno: line.new_lineno(),
                    });
                }
            }
        }

        true
    })?;

    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TempRepo;

    #[test]
    fn test_empty_repo_diffs() {
        let repo = TempRepo::new();

        // 1. Staged diff on empty repo (no commits, no staging yet)
        let staged = get_staged_diff(repo.path_str()).unwrap();
        assert!(staged.is_empty());

        // 2. Unstaged diff (no files yet)
        let workdir = get_workdir_diff(repo.path_str()).unwrap();
        assert!(workdir.is_empty());
    }

    #[test]
    fn test_workdir_and_staged_diff_parsing() {
        let repo = TempRepo::new();
        repo.write_file("test.txt", "hello world\nline2\n");

        // 1. Unstaged diff should show the added file test.txt
        let workdir = get_workdir_diff(repo.path_str()).unwrap();
        assert_eq!(workdir.len(), 1);
        assert_eq!(workdir[0].new_path.as_deref(), Some("test.txt"));
        assert_eq!(workdir[0].status, "untracked");
        assert_eq!(workdir[0].stats.additions, 0);

        // 2. Stage the file
        let git_repo = Repository::open(repo.path_str()).unwrap();
        let mut index = git_repo.index().unwrap();
        index.add_path(std::path::Path::new("test.txt")).unwrap();
        index.write().unwrap();

        // 3. Staged diff should show the file
        let staged = get_staged_diff(repo.path_str()).unwrap();
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].new_path.as_deref(), Some("test.txt"));
        assert_eq!(staged[0].status, "added");
        assert_eq!(staged[0].stats.additions, 2);

        // 4. Modify staged file in workdir
        repo.write_file("test.txt", "hello world\nline2\nline3\n");
        let workdir2 = get_workdir_diff(repo.path_str()).unwrap();
        assert_eq!(workdir2.len(), 1);
        assert_eq!(workdir2[0].status, "modified");
        assert_eq!(workdir2[0].stats.additions, 1);
    }
}
