use git2::{Repository, StatusOptions};
use serde::Serialize;
use std::path::Path;

use crate::error::AppError;

/// The operation a repository is in the middle of.
///
/// Serialised as the variant name ("Clean", "RebaseMerge", ...) — the same
/// strings the frontend received when this was `format!("{:?}", state)`. The
/// mapping from git2 is spelled out so that a new or renamed git2 variant is a
/// compile error here instead of a silently different string in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum RepoState {
    Clean,
    Merge,
    Revert,
    RevertSequence,
    CherryPick,
    CherryPickSequence,
    Bisect,
    Rebase,
    RebaseInteractive,
    RebaseMerge,
    ApplyMailbox,
    ApplyMailboxOrRebase,
}

impl From<git2::RepositoryState> for RepoState {
    fn from(state: git2::RepositoryState) -> Self {
        use git2::RepositoryState as S;
        match state {
            S::Clean => Self::Clean,
            S::Merge => Self::Merge,
            S::Revert => Self::Revert,
            S::RevertSequence => Self::RevertSequence,
            S::CherryPick => Self::CherryPick,
            S::CherryPickSequence => Self::CherryPickSequence,
            S::Bisect => Self::Bisect,
            S::Rebase => Self::Rebase,
            S::RebaseInteractive => Self::RebaseInteractive,
            S::RebaseMerge => Self::RebaseMerge,
            S::ApplyMailbox => Self::ApplyMailbox,
            S::ApplyMailboxOrRebase => Self::ApplyMailboxOrRebase,
        }
    }
}

/// How a listed file differs (`FileStatus.status`). Serialised lowercase:
/// "added", "modified", "deleted", "renamed", "typechange".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Typechange,
}

/// Summary info returned when opening a repository.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub is_bare: bool,
    pub is_empty: bool,
    pub state: RepoState,
}

/// Branch representation for the sidebar.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub oid: String,
}

/// Remote information.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

/// Tag information.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub oid: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub is_annotated: bool,
}

/// File status in the working tree.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub status: FileChangeKind,
    pub is_staged: bool,
    /// For a rename, the path it was renamed from; `path` is the new one.
    pub old_path: Option<String>,
}

/// Full repo status for the UI.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<String>,
    pub conflicted: Vec<String>,
    pub state: RepoState,
}

/// Open a repository and return summary info.
pub fn open_repo(path: &str) -> Result<RepoInfo, AppError> {
    let repo = Repository::discover(path)?;
    let workdir_path = repo.workdir().unwrap_or_else(|| repo.path());
    let canonical_workdir = std::fs::canonicalize(workdir_path)?;
    let workdir = canonical_workdir.to_string_lossy().to_string();

    let name = Path::new(&workdir)
        .file_name()
        .or_else(|| Path::new(&workdir).parent().and_then(|p| p.file_name()))
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().ok().map(String::from));

    let state = RepoState::from(repo.state());

    Ok(RepoInfo {
        path: workdir,
        name,
        head_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
        state,
    })
}

/// The new-side (or old-side) path of a status delta.
fn delta_path(delta: Option<git2::DiffDelta<'_>>, new_side: bool) -> Option<String> {
    let delta = delta?;
    let file = if new_side {
        delta.new_file()
    } else {
        delta.old_file()
    };
    file.path().map(|p| p.to_string_lossy().into_owned())
}

/// Get the full working tree status.
pub fn get_status(path: &str) -> Result<RepoStatus, AppError> {
    let repo = Repository::open(path)?;

    let mut opts = StatusOptions::new();
    // Renames are detected for staged changes only, like `git status`. In the
    // working tree a rename is a deletion plus an untracked file, and showing
    // it as such keeps each half stageable on its own; paired up, the
    // untracked new file vanished from the list behind the old path.
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true);

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for entry in statuses.iter() {
        let path_str = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.is_conflicted() {
            conflicted.push(path_str.clone());
        }

        // `StatusEntry::path` is the *old* path of the entry. For a staged
        // rename that is the name the file no longer has, so the list showed
        // (and staged, and diffed) the old name. Each side reports its own
        // current path instead.
        let staged_path =
            delta_path(entry.head_to_index(), true).unwrap_or_else(|| path_str.clone());
        let unstaged_path =
            delta_path(entry.index_to_workdir(), true).unwrap_or_else(|| path_str.clone());

        // Staged changes (index vs HEAD)
        // Renamed first: a rename with content changes can also carry the
        // modified flag, and must still be shown as the rename it is.
        let staged_kind = if status.is_index_renamed() {
            Some(FileChangeKind::Renamed)
        } else if status.is_index_new() {
            Some(FileChangeKind::Added)
        } else if status.is_index_modified() {
            Some(FileChangeKind::Modified)
        } else if status.is_index_deleted() {
            Some(FileChangeKind::Deleted)
        } else if status.is_index_typechange() {
            // e.g. a file replaced by a symlink; previously not listed at all.
            Some(FileChangeKind::Typechange)
        } else {
            None
        };
        if let Some(kind) = staged_kind {
            staged.push(FileStatus {
                path: staged_path,
                status: kind,
                is_staged: true,
                old_path: if status.is_index_renamed() {
                    delta_path(entry.head_to_index(), false)
                } else {
                    None
                },
            });
        }

        // Unstaged changes (workdir vs index)
        let unstaged_kind = if status.is_wt_modified() {
            Some(FileChangeKind::Modified)
        } else if status.is_wt_deleted() {
            Some(FileChangeKind::Deleted)
        } else if status.is_wt_typechange() {
            Some(FileChangeKind::Typechange)
        } else {
            None
        };
        if let Some(kind) = unstaged_kind {
            unstaged.push(FileStatus {
                path: unstaged_path.clone(),
                status: kind,
                is_staged: false,
                old_path: None,
            });
        }
        if status.is_wt_new() {
            untracked.push(unstaged_path);
        }
    }

    // Branch info
    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().ok().map(String::from));

    let (ahead, behind) = get_ahead_behind(&repo).unwrap_or((0, 0));
    let state = RepoState::from(repo.state());

    Ok(RepoStatus {
        branch: head_branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        conflicted,
        state,
    })
}

/// Ahead/behind counts for `branch` relative to its upstream, along with the
/// upstream's name. Shared by `get_ahead_behind` (current branch) and
/// `list_branches` (every local branch), which previously computed this
/// independently.
fn upstream_ahead_behind(
    repo: &Repository,
    branch: &git2::Branch,
) -> Result<(Option<String>, usize, usize), AppError> {
    match branch.upstream() {
        Ok(upstream_branch) => {
            let upstream_name = upstream_branch.name()?.unwrap_or("").to_string();
            let local_oid = branch.get().target();
            let remote_oid = upstream_branch.get().target();
            let (a, b) = match (local_oid, remote_oid) {
                (Some(l), Some(r)) => repo.graph_ahead_behind(l, r).unwrap_or((0, 0)),
                _ => (0, 0),
            };
            Ok((Some(upstream_name), a, b))
        }
        Err(_) => Ok((None, 0, 0)),
    }
}

/// Get ahead/behind counts relative to upstream.
pub fn get_ahead_behind(repo: &Repository) -> Result<(usize, usize), AppError> {
    let head = repo.head()?;
    let branch_name = head.shorthand().unwrap_or("HEAD");
    if branch_name == "HEAD" {
        return Ok((0, 0));
    }

    let local_branch = match repo.find_branch(branch_name, git2::BranchType::Local) {
        Ok(b) => b,
        Err(_) => return Ok((0, 0)),
    };

    let (_, ahead, behind) = upstream_ahead_behind(repo, &local_branch)?;
    Ok((ahead, behind))
}

/// List all branches (local + remote).
pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, AppError> {
    let repo = Repository::open(path)?;
    let mut branches = Vec::new();

    for branch_result in repo.branches(None)? {
        let (branch, branch_type) = branch_result?;
        let name = branch.name()?.unwrap_or("").to_string();
        let is_head = branch.is_head();
        let is_remote = branch_type == git2::BranchType::Remote;

        let oid = branch
            .get()
            .target()
            .map(|o| o.to_string())
            .unwrap_or_default();

        let (upstream, ahead, behind) = if !is_remote {
            upstream_ahead_behind(&repo, &branch)?
        } else {
            (None, 0, 0)
        };

        branches.push(BranchInfo {
            name,
            is_head,
            is_remote,
            upstream,
            ahead,
            behind,
            oid,
        });
    }

    branches.sort_by(|a, b| {
        // HEAD branch first, then local, then remote
        match (a.is_head, b.is_head) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => match (a.is_remote, b.is_remote) {
                (false, true) => std::cmp::Ordering::Less,
                (true, false) => std::cmp::Ordering::Greater,
                _ => natural_cmp(&a.name, &b.name),
            },
        }
    });

    Ok(branches)
}

/// List remotes.
pub fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, AppError> {
    let repo = Repository::open(path)?;
    let remote_names = repo.remotes()?;
    let mut remotes = Vec::new();

    for name in remote_names.iter().flatten().flatten() {
        let remote = repo.find_remote(name)?;
        remotes.push(RemoteInfo {
            name: name.to_string(),
            url: remote.url().ok().map(String::from),
            push_url: remote.pushurl().ok().flatten().map(String::from),
        });
    }

    Ok(remotes)
}

/// List tags.
pub fn list_tags(path: &str) -> Result<Vec<TagInfo>, AppError> {
    let repo = Repository::open(path)?;
    let mut tags = Vec::new();

    repo.tag_foreach(|oid, name_bytes| {
        let name = String::from_utf8_lossy(name_bytes)
            .trim_start_matches("refs/tags/")
            .to_string();

        let (message, tagger, is_annotated) = match repo.find_tag(oid) {
            Ok(tag) => {
                let msg = tag.message().ok().flatten().map(String::from);
                let tgr = tag
                    .tagger()
                    .map(|s| format!("{} <{}>", s.name().unwrap_or(""), s.email().unwrap_or("")));
                (msg, tgr, true)
            }
            Err(_) => (None, None, false),
        };

        tags.push(TagInfo {
            name,
            oid: oid.to_string(),
            message,
            tagger,
            is_annotated,
        });

        true
    })?;

    tags.sort_by(|a, b| natural_cmp(&b.name, &a.name));
    Ok(tags)
}

#[derive(Debug, PartialEq, Eq)]
enum Chunk<'a> {
    Num(u64, &'a str),
    Str(&'a str),
}

struct ChunkIterator<'a> {
    s: &'a str,
}

impl<'a> ChunkIterator<'a> {
    fn new(s: &'a str) -> Self {
        Self { s }
    }
}

impl<'a> Iterator for ChunkIterator<'a> {
    type Item = Chunk<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.s.is_empty() {
            return None;
        }

        let first_char = self.s.chars().next()?;
        if first_char.is_ascii_digit() {
            let end = self
                .s
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(self.s.len());
            let num_str = &self.s[..end];
            self.s = &self.s[end..];
            let parsed = num_str.parse::<u64>().unwrap_or(u64::MAX);
            Some(Chunk::Num(parsed, num_str))
        } else {
            let end = self
                .s
                .find(|c: char| c.is_ascii_digit())
                .unwrap_or(self.s.len());
            let text = &self.s[..end];
            self.s = &self.s[end..];
            Some(Chunk::Str(text))
        }
    }
}

pub fn natural_cmp(s1: &str, s2: &str) -> std::cmp::Ordering {
    let mut c1 = ChunkIterator::new(s1);
    let mut c2 = ChunkIterator::new(s2);

    loop {
        match (c1.next(), c2.next()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(Chunk::Num(n1, str1)), Some(Chunk::Num(n2, str2))) => match n1.cmp(&n2) {
                std::cmp::Ordering::Equal => match str1.cmp(str2) {
                    std::cmp::Ordering::Equal => continue,
                    ord => return ord,
                },
                ord => return ord,
            },
            (Some(Chunk::Str(str1)), Some(Chunk::Str(str2))) => match str1.cmp(str2) {
                std::cmp::Ordering::Equal => continue,
                ord => return ord,
            },
            (Some(Chunk::Num(_, str1)), Some(Chunk::Str(str2))) => match str1.cmp(str2) {
                std::cmp::Ordering::Equal => continue,
                ord => return ord,
            },
            (Some(Chunk::Str(str1)), Some(Chunk::Num(_, str2))) => match str1.cmp(str2) {
                std::cmp::Ordering::Equal => continue,
                ord => return ord,
            },
        }
    }
}

#[cfg(test)]
mod repo_state_tests {
    use super::RepoState;
    use git2::RepositoryState as S;

    /// The frontend matches on these exact strings; they must stay what the
    /// old `format!("{:?}", git2_state)` produced.
    #[test]
    fn serialises_exactly_as_the_git2_debug_names() {
        for state in [
            S::Clean,
            S::Merge,
            S::Revert,
            S::RevertSequence,
            S::CherryPick,
            S::CherryPickSequence,
            S::Bisect,
            S::Rebase,
            S::RebaseInteractive,
            S::RebaseMerge,
            S::ApplyMailbox,
            S::ApplyMailboxOrRebase,
        ] {
            assert_eq!(
                serde_json::to_string(&RepoState::from(state)).unwrap(),
                format!("\"{:?}\"", state)
            );
        }
    }
}

#[cfg(test)]
mod file_change_kind_tests {
    use super::FileChangeKind;

    /// `FileStatus.status` on the frontend is this exact union of strings.
    #[test]
    fn serialises_to_the_frontend_strings() {
        let names: Vec<String> = [
            FileChangeKind::Added,
            FileChangeKind::Modified,
            FileChangeKind::Deleted,
            FileChangeKind::Renamed,
            FileChangeKind::Typechange,
        ]
        .iter()
        .map(|k| serde_json::to_string(k).unwrap())
        .collect();
        assert_eq!(
            names,
            [
                "\"added\"",
                "\"modified\"",
                "\"deleted\"",
                "\"renamed\"",
                "\"typechange\""
            ]
        );
    }
}
