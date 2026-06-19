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
    opts.include_untracked(true)
        .recurse_untracked_dirs(true);

    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))?;
    parse_diff(&diff)
}

/// Get the diff of the index vs HEAD (staged changes).
pub fn get_staged_diff(path: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;

    let head_tree = repo.head()?.peel_to_tree()?;
    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))?;
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
        let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
        let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());
        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Modified => "modified",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Copied => "copied",
            git2::Delta::Typechange => "typechange",
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

    // Now walk the diff to populate hunks and lines
    let mut current_file_idx: Option<usize> = None;
    let mut additions: usize = 0;
    let mut deletions: usize = 0;

    diff.print(DiffFormat::Patch, |delta, hunk, line| {
        let file_path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string());

        // Find matching file
        let file_idx = files.iter().position(|f| {
            f.new_path == file_path || f.old_path == file_path
        });

        if let Some(idx) = file_idx {
            if current_file_idx != Some(idx) {
                // Save stats for previous file
                if let Some(prev_idx) = current_file_idx {
                    files[prev_idx].stats = DiffStats {
                        additions,
                        deletions,
                    };
                }
                current_file_idx = Some(idx);
                additions = 0;
                deletions = 0;
            }

            if let Some(hunk_info) = hunk {
                let header = String::from_utf8_lossy(hunk_info.header()).trim().to_string();

                // Ensure hunk exists
                let hunk_exists = files[idx]
                    .hunks
                    .last()
                    .map(|h| h.old_start == hunk_info.old_start() && h.new_start == hunk_info.new_start())
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

                let origin = match line.origin() {
                    '+' => {
                        additions += 1;
                        "+".to_string()
                    }
                    '-' => {
                        deletions += 1;
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

    // Save stats for last file
    if let Some(idx) = current_file_idx {
        files[idx].stats = DiffStats {
            additions,
            deletions,
        };
    }

    Ok(files)
}
