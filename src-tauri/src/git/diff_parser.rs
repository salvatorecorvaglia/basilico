use git2::{Diff, DiffOptions, Repository};
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
    pub truncated: bool,
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
    opts.max_size(crate::git::content_limits::MAX_TEXT_BYTES as i64);
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))?;
    parse_diff(&diff)
}

/// Pair deletions with additions of similar content into renames.
///
/// Commit, staged and compare diffs never ran this, so every moved file showed
/// up as an unrelated deletion plus a brand-new file. Working-tree diffs are
/// left alone, matching `git status`, which does not pair untracked files.
fn detect_renames(diff: &mut Diff) -> Result<(), AppError> {
    let mut opts = git2::DiffFindOptions::new();
    opts.renames(true);
    diff.find_similar(Some(&mut opts))?;
    Ok(())
}

/// Get the diff of the index vs HEAD (staged changes).
pub fn get_staged_diff(path: &str) -> Result<Vec<FileDiff>, AppError> {
    let repo = Repository::open(path)?;

    let head_tree = match repo.head() {
        Ok(head_ref) => Some(head_ref.peel_to_tree()?),
        Err(_) => None,
    };
    let mut opts = DiffOptions::new();
    opts.max_size(crate::git::content_limits::MAX_TEXT_BYTES as i64);
    let mut diff = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?;
    detect_renames(&mut diff)?;
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
    opts.max_size(crate::git::content_limits::MAX_TEXT_BYTES as i64);
    let mut diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    detect_renames(&mut diff)?;
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
    opts.max_size(crate::git::content_limits::MAX_TEXT_BYTES as i64);
    let mut diff = repo.diff_tree_to_tree(Some(&base_tree), Some(&target_tree), Some(&mut opts))?;
    detect_renames(&mut diff)?;
    parse_diff(&diff)
}

/// Get diff for a single file (staged or unstaged).
pub fn get_file_diff(path: &str, file_path: &str, is_staged: bool) -> Result<FileDiff, AppError> {
    let repo = Repository::open(path)?;
    let mut opts = DiffOptions::new();
    opts.max_size(crate::git::content_limits::MAX_TEXT_BYTES as i64);
    opts.pathspec(file_path).disable_pathspec_match(true);

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
        // Untracked files must be included, exactly as `get_workdir_diff` does.
        // Without this an untracked path produces no delta at all, so the
        // `NotFound` below fires for every newly-created file the user clicks
        // in the staging list.
        //
        // `show_untracked_content` is what makes that delta useful: libgit2
        // otherwise reports the file as changed but emits no hunks, leaving
        // the granular staging view empty and the +/- counters at zero. It is
        // safe to pay for here because this diff is scoped to one pathspec,
        // and `parse_diff` truncates anything oversized.
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
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
    if num_deltas > 1000 {
        return Err(AppError::invalid_state(
            "Diff exceeds 1,000 files. Select an individual file to inspect changes.",
        ));
    }
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

        // libgit2 only sets the binary flag once it has inspected the blob
        // content, which happens during the walk below — so this is an initial
        // guess, corrected in the print callback.
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
            truncated: false,
        });
    }

    // A patch is built one file at a time. Stopping retention never leaves a
    // partial hunk eligible for staging; oversized files show a notice instead.
    let mut retained_bytes: usize = files
        .iter()
        .map(|f| {
            512 + 6
                * (f.old_path.as_ref().map_or(0, |s| s.len())
                    + f.new_path.as_ref().map_or(0, |s| s.len()))
        })
        .sum();
    if retained_bytes > 4 * 1024 * 1024 {
        return Err(AppError::invalid_state(
            "Diff paths exceed the display budget. Select an individual file.",
        ));
    }
    for (idx, file) in files.iter_mut().enumerate() {
        let delta = diff.get_delta(idx).unwrap();
        let oversized = delta.old_file().size() > crate::git::content_limits::MAX_TEXT_BYTES as u64
            || delta.new_file().size() > crate::git::content_limits::MAX_TEXT_BYTES as u64;
        if oversized || retained_bytes >= 4 * 1024 * 1024 {
            mark_truncated(file);
            continue;
        }
        let patch = git2::Patch::from_diff(diff, idx)?;
        let inspected = patch
            .as_ref()
            .map(|patch| patch.delta())
            .unwrap_or_else(|| diff.get_delta(idx).unwrap());
        file.is_binary = inspected.flags().is_binary();
        if inspected.old_file().size() > crate::git::content_limits::MAX_TEXT_BYTES as u64
            || inspected.new_file().size() > crate::git::content_limits::MAX_TEXT_BYTES as u64
        {
            mark_truncated(file);
            continue;
        }
        let Some(patch) = patch else {
            file.is_binary = inspected.flags().is_binary();
            continue;
        };
        let mut file_bytes = 0usize;
        let mut lines = 0usize;
        'hunks: for hunk_idx in 0..patch.num_hunks() {
            let (hunk, count) = patch.hunk(hunk_idx)?;
            let mut parsed = DiffHunkInfo {
                header: String::from_utf8_lossy(hunk.header()).trim().to_string(),
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                lines: Vec::new(),
            };
            for line_idx in 0..count {
                let line = patch.line_in_hunk(hunk_idx, line_idx)?;
                // Charge conservatively for JSON escaping and repeated keys.
                let cost = line.content().len().saturating_mul(6) + 128;
                if line.content().len() > 16 * 1024
                    || lines >= 5000
                    || file_bytes + cost > 1024 * 1024
                    || retained_bytes + cost > 4 * 1024 * 1024
                {
                    mark_truncated(file);
                    break 'hunks;
                }
                lines += 1;
                file_bytes += cost;
                retained_bytes += cost;
                match line.origin() {
                    '+' => file.stats.additions += 1,
                    '-' => file.stats.deletions += 1,
                    _ => {}
                }
                parsed.lines.push(DiffLineInfo {
                    origin: line.origin().to_string(),
                    content: String::from_utf8_lossy(line.content()).into_owned(),
                    old_lineno: line.old_lineno(),
                    new_lineno: line.new_lineno(),
                });
            }
            file.hunks.push(parsed);
        }
    }
    Ok(files)
}

fn mark_truncated(file: &mut FileDiff) {
    file.truncated = true;
    file.stats.additions = 0;
    file.stats.deletions = 0;
    file.hunks = vec![DiffHunkInfo {
        header: "Truncated".into(), old_start: 0, old_lines: 0, new_start: 0, new_lines: 0,
        lines: vec![DiffLineInfo { origin: "info".into(), content: "Diff truncated: display limit exceeded. Use your external editor or stage the whole file.".into(), old_lineno: None, new_lineno: None }],
    }];
}
