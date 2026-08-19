use git2::{Repository, Sort};
use serde::Serialize;
use std::collections::HashMap;

use crate::error::AppError;

/// A single commit node in the graph.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub author_date: i64,
    pub committer_name: String,
    pub committer_date: i64,
    pub parent_oids: Vec<String>,
    pub refs: Vec<RefLabel>,
    /// Lane index for graph rendering (assigned in compute_lanes)
    pub lane: usize,
    /// Connections to parent commits for graph edges
    pub edges: Vec<GraphEdge>,
}

/// A ref label (branch, tag, HEAD) attached to a commit.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Serialize, Clone)]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
    Head,
}

/// An edge connecting a commit to its parent in the graph.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from_lane: usize,
    pub to_lane: usize,
    pub to_oid: String,
    pub is_merge: bool,
}

/// Build the commit graph with lane assignments for rendering.
pub fn build_graph(
    path: &str,
    max_commits: usize,
    first_parent: bool,
    hide_remotes: bool,
    path_filter: Option<&str>,
) -> Result<Vec<GraphCommit>, AppError> {
    build_graph_page(
        path,
        0,
        max_commits,
        first_parent,
        hide_remotes,
        path_filter,
    )
}

/// Build one page of the commit graph.
///
/// `skip` commits are still walked — lane assignment is a forward pass and the
/// lanes in a page depend on everything before it — but only their OIDs and
/// parents are read. Loading more commits therefore no longer re-serialises the
/// messages, authors and dates of every commit already on screen.
pub fn build_graph_page(
    path: &str,
    skip: usize,
    max_commits: usize,
    first_parent: bool,
    hide_remotes: bool,
    path_filter: Option<&str>,
) -> Result<Vec<GraphCommit>, AppError> {
    let repo = Repository::open(path)?;

    // Collect refs for labeling
    let ref_map = build_ref_map(&repo, hide_remotes)?;

    // Walk commits
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;

    if first_parent {
        let _ = revwalk.simplify_first_parent();
    }

    let _ = revwalk.push_head();

    // Also push all branches/tags so we see the full graph
    for r in repo.references()?.flatten() {
        let is_remote = r
            .name()
            .map(|n| n.starts_with("refs/remotes/"))
            .unwrap_or(false);
        if hide_remotes && is_remote {
            continue;
        }
        if let Ok(commit_ref) = r.peel(git2::ObjectType::Commit) {
            let _ = revwalk.push(commit_ref.id());
        }
    }

    let mut commits: Vec<GraphCommit> = Vec::new();
    let clean_path = path_filter.map(|s| s.trim()).filter(|s| !s.is_empty());

    let mut scanned = 0usize;
    let mut matched = 0usize;
    let budget = skip.saturating_add(max_commits);

    for oid_result in revwalk {
        if commits.len() >= budget {
            break;
        }

        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        if let Some(target_path) = clean_path {
            scanned += 1;
            if scanned > PATH_FILTER_SCAN_LIMIT {
                break;
            }
            if !commit_touches_path(&repo, &commit, target_path)? {
                continue;
            }
        }

        let oid_str = oid.to_string();
        let parent_oids: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();

        // Rows before the requested page contribute their topology to lane
        // assignment but are never sent to the client, so the costly field
        // extraction is skipped for them.
        if matched < skip {
            matched += 1;
            commits.push(GraphCommit {
                short_oid: oid_str[..7.min(oid_str.len())].to_string(),
                oid: oid_str,
                message: String::new(),
                author_name: String::new(),
                author_email: String::new(),
                author_date: 0,
                committer_name: String::new(),
                committer_date: 0,
                parent_oids,
                refs: Vec::new(),
                lane: 0,
                edges: Vec::new(),
            });
            continue;
        }

        matched += 1;
        let refs = ref_map.get(&oid_str).cloned().unwrap_or_default();

        let author = commit.author();
        let committer = commit.committer();

        commits.push(GraphCommit {
            short_oid: oid_str[..7.min(oid_str.len())].to_string(),
            oid: oid_str,
            message: commit
                .message()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string(),
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            author_date: author.when().seconds(),
            committer_name: committer.name().unwrap_or("").to_string(),
            committer_date: committer.when().seconds(),
            parent_oids,
            refs,
            lane: 0,
            edges: Vec::new(),
        });
    }

    // Lanes must be assigned over the full prefix so the page's lanes line up
    // with the rows already displayed.
    compute_lanes(&mut commits);

    if skip > 0 {
        commits.drain(..skip.min(commits.len()));
    }

    Ok(commits)
}

/// Ceiling on how many commits are inspected when a path filter is active.
///
/// The `max_commits` limit counts *matching* commits, so a filter that matches
/// rarely would otherwise walk the entire history before returning. Also used
/// by `commands::history::get_file_history`, which scans for the same reason.
pub const PATH_FILTER_SCAN_LIMIT: usize = 20_000;

/// True when `target_path` looks like a literal file path rather than a
/// pathspec pattern. Literal paths can be tested far more cheaply.
fn is_literal_path(target_path: &str) -> bool {
    !target_path.contains(['*', '?', '[', ']', ':'])
}

/// Fast path: a commit touched `target_path` iff the tree entry at that path
/// differs from the parent's.
///
/// Comparing two tree-entry OIDs costs one path lookup per tree, against the
/// full tree-to-tree diff the general case needs — the difference between
/// O(depth) and O(tree size) for every commit in the walk.
fn commit_touches_literal_path(commit: &git2::Commit, target_path: &str) -> Result<bool, AppError> {
    let entry_oid = |tree: &git2::Tree| -> Option<git2::Oid> {
        tree.get_path(std::path::Path::new(target_path))
            .ok()
            .map(|e| e.id())
    };

    let tree = commit.tree()?;
    let current = entry_oid(&tree);

    match commit.parent(0) {
        Ok(parent) => {
            let parent_tree = parent.tree()?;
            Ok(current != entry_oid(&parent_tree))
        }
        // A root commit touches the path if it contains it at all.
        Err(_) => Ok(current.is_some()),
    }
}

fn commit_touches_path(
    repo: &Repository,
    commit: &git2::Commit,
    target_path: &str,
) -> Result<bool, AppError> {
    if is_literal_path(target_path) {
        return commit_touches_literal_path(commit, target_path);
    }

    let tree = commit.tree()?;
    let parent_tree = match commit.parent(0) {
        Ok(p) => Some(p.tree()?),
        Err(_) => None,
    };

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(target_path);

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    Ok(diff.deltas().len() > 0)
}

/// Build a map of oid -> ref labels.
fn build_ref_map(
    repo: &Repository,
    hide_remotes: bool,
) -> Result<HashMap<String, Vec<RefLabel>>, AppError> {
    let mut map: HashMap<String, Vec<RefLabel>> = HashMap::new();

    // HEAD
    if let Ok(head) = repo.head() {
        if let Some(oid) = head.target() {
            map.entry(oid.to_string()).or_default().push(RefLabel {
                name: "HEAD".to_string(),
                kind: RefKind::Head,
            });
        }
    }

    // Branches
    for branch_result in repo.branches(None)? {
        let (branch, branch_type) = branch_result?;
        if hide_remotes && branch_type == git2::BranchType::Remote {
            continue;
        }
        let name = branch.name()?.unwrap_or("").to_string();
        if let Some(oid) = branch.get().target() {
            let kind = match branch_type {
                git2::BranchType::Local => RefKind::LocalBranch,
                git2::BranchType::Remote => RefKind::RemoteBranch,
            };
            map.entry(oid.to_string())
                .or_default()
                .push(RefLabel { name, kind });
        }
    }

    // Tags
    repo.tag_foreach(|oid, name_bytes| {
        let name = String::from_utf8_lossy(name_bytes)
            .trim_start_matches("refs/tags/")
            .to_string();

        // Resolve tags (lightweight or annotated) to their target commit
        let target_oid = match repo
            .find_object(oid, None)
            .and_then(|obj| obj.peel(git2::ObjectType::Commit))
        {
            Ok(peeled) => peeled.id().to_string(),
            Err(_) => oid.to_string(),
        };

        map.entry(target_oid).or_default().push(RefLabel {
            name,
            kind: RefKind::Tag,
        });

        true
    })?;

    Ok(map)
}

/// Compute lane assignments for graph rendering.
/// Uses a simple greedy lane allocation algorithm.
pub fn compute_lanes(commits: &mut [GraphCommit]) {
    if commits.is_empty() {
        return;
    }

    // Gather all walked commit OIDs to identify boundary commits without heap allocations
    let walked_oids: std::collections::HashSet<git2::Oid> = commits
        .iter()
        .filter_map(|c| git2::Oid::from_str(&c.oid).ok())
        .collect();

    // Active lanes: each lane tracks which oid it's expecting next
    let mut active_lanes: Vec<Option<String>> = Vec::new();

    for commit in commits.iter_mut() {
        let oid = commit.oid.clone();
        let parent_oids = commit.parent_oids.clone();

        // Find existing lane for this commit
        let lane = active_lanes
            .iter()
            .position(|l| l.as_deref() == Some(&oid))
            .unwrap_or_else(|| {
                // Allocate new lane
                let free = active_lanes.iter().position(|l| l.is_none());
                match free {
                    Some(idx) => idx,
                    None => {
                        active_lanes.push(None);
                        active_lanes.len() - 1
                    }
                }
            });

        commit.lane = lane;

        // Clear all lanes pointing to this commit
        for l in active_lanes.iter_mut() {
            if l.as_deref() == Some(&oid) {
                *l = None;
            }
        }

        // Assign parents to lanes
        let mut edges = Vec::new();

        for (p_idx, parent_oid) in parent_oids.iter().enumerate() {
            let parent_git_oid = git2::Oid::from_str(parent_oid).unwrap_or(git2::Oid::ZERO_SHA1);
            let is_boundary = !walked_oids.contains(&parent_git_oid);

            let target_lane = if p_idx == 0 {
                // First parent takes current lane
                if !is_boundary {
                    active_lanes[lane] = Some(parent_oid.clone());
                } else {
                    active_lanes[lane] = None;
                }
                lane
            } else {
                // Merge parents get a new or free lane
                let existing = active_lanes
                    .iter()
                    .position(|l| l.as_deref() == Some(parent_oid));
                match existing {
                    Some(l) => l,
                    None => {
                        let free = active_lanes.iter().position(|l| l.is_none());
                        let new_lane = match free {
                            Some(idx) => idx,
                            None => {
                                active_lanes.push(None);
                                active_lanes.len() - 1
                            }
                        };
                        if !is_boundary {
                            active_lanes[new_lane] = Some(parent_oid.clone());
                        }
                        new_lane
                    }
                }
            };

            edges.push(GraphEdge {
                from_lane: lane,
                to_lane: target_lane,
                to_oid: parent_oid.clone(),
                is_merge: p_idx > 0,
            });
        }

        commit.edges = edges;
    }
}
