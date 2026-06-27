use git2::{Repository, StatusOptions};
use serde::Serialize;
use std::path::Path;

use crate::error::AppError;

/// Summary info returned when opening a repository.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub is_bare: bool,
    pub is_empty: bool,
    pub state: String,
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
    pub status: String,
    pub is_staged: bool,
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
    pub state: String,
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
        .and_then(|h| h.shorthand().map(String::from));

    let state = format!("{:?}", repo.state());

    Ok(RepoInfo {
        path: workdir,
        name,
        head_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
        state,
    })
}

/// Get the full working tree status.
pub fn get_status(path: &str) -> Result<RepoStatus, AppError> {
    let repo = Repository::open(path)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

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

        // Staged changes (index vs HEAD)
        if status.is_index_new() {
            staged.push(FileStatus {
                path: path_str.clone(),
                status: "added".to_string(),
                is_staged: true,
            });
        }
        if status.is_index_modified() {
            staged.push(FileStatus {
                path: path_str.clone(),
                status: "modified".to_string(),
                is_staged: true,
            });
        }
        if status.is_index_deleted() {
            staged.push(FileStatus {
                path: path_str.clone(),
                status: "deleted".to_string(),
                is_staged: true,
            });
        }
        if status.is_index_renamed() {
            staged.push(FileStatus {
                path: path_str.clone(),
                status: "renamed".to_string(),
                is_staged: true,
            });
        }

        // Unstaged changes (workdir vs index)
        if status.is_wt_modified() {
            unstaged.push(FileStatus {
                path: path_str.clone(),
                status: "modified".to_string(),
                is_staged: false,
            });
        }
        if status.is_wt_deleted() {
            unstaged.push(FileStatus {
                path: path_str.clone(),
                status: "deleted".to_string(),
                is_staged: false,
            });
        }
        if status.is_wt_renamed() {
            unstaged.push(FileStatus {
                path: path_str.clone(),
                status: "renamed".to_string(),
                is_staged: false,
            });
        }
        if status.is_wt_new() {
            untracked.push(path_str);
        }
    }

    // Branch info
    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    let (ahead, behind) = get_ahead_behind(&repo).unwrap_or((0, 0));
    let state = format!("{:?}", repo.state());

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

/// Get ahead/behind counts relative to upstream.
pub fn get_ahead_behind(repo: &Repository) -> Result<(usize, usize), AppError> {
    let head = repo.head()?;
    let local_oid = head.target().ok_or_else(|| AppError {
        message: "HEAD has no target".to_string(),
        kind: crate::error::ErrorKind::GitError,
    })?;

    let branch_name = head.shorthand().unwrap_or("HEAD");
    if branch_name == "HEAD" {
        return Ok((0, 0));
    }

    let local_branch = match repo.find_branch(branch_name, git2::BranchType::Local) {
        Ok(b) => b,
        Err(_) => return Ok((0, 0)),
    };

    let upstream_branch = match local_branch.upstream() {
        Ok(u) => u,
        Err(_) => return Ok((0, 0)),
    };

    let upstream_ref = upstream_branch.into_reference();
    let upstream_oid = upstream_ref.target().ok_or_else(|| AppError {
        message: "upstream has no target".to_string(),
        kind: crate::error::ErrorKind::GitError,
    })?;

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
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
            match branch.upstream() {
                Ok(upstream_branch) => {
                    let upstream_name = upstream_branch.name()?.unwrap_or("").to_string();
                    let local_oid = branch.get().target();
                    let remote_oid = upstream_branch.get().target();
                    let (a, b) = match (local_oid, remote_oid) {
                        (Some(l), Some(r)) => repo.graph_ahead_behind(l, r).unwrap_or((0, 0)),
                        _ => (0, 0),
                    };
                    (Some(upstream_name), a, b)
                }
                Err(_) => (None, 0, 0),
            }
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
                _ => a.name.cmp(&b.name),
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

    for name in remote_names.iter().flatten() {
        let remote = repo.find_remote(name)?;
        remotes.push(RemoteInfo {
            name: name.to_string(),
            url: remote.url().map(String::from),
            push_url: remote.pushurl().map(String::from),
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
                let msg = tag.message().map(String::from);
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

    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}
