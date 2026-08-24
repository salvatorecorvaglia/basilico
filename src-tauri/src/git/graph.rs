use git2::{Repository, Sort};
use parking_lot::Mutex;
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

    let mut active_lanes: Vec<Option<String>> = Vec::new();

    for commit in commits.iter_mut() {
        assign_lane(commit, &mut active_lanes, |parent_oid, _is_first| {
            let parent_git_oid = git2::Oid::from_str(parent_oid).unwrap_or(git2::Oid::ZERO_SHA1);
            !walked_oids.contains(&parent_git_oid)
        });
    }
}

/// Assign a lane and parent edges to a single commit, given the lanes
/// currently active going into it. Shared by [`compute_lanes`] (one-shot,
/// whole-history-known) and the incremental cache in [`build_graph_page_cached`]
/// (state carried across paginated calls).
///
/// `is_boundary(parent_oid, is_first_parent)` decides whether a parent should
/// be treated as outside the walked set (lane terminates) or still-pending
/// (lane stays reserved for it). The two callers use different definitions of
/// "boundary" — see the caller-side comments for why.
fn assign_lane(
    commit: &mut GraphCommit,
    active_lanes: &mut Vec<Option<String>>,
    is_boundary: impl Fn(&str, bool) -> bool,
) {
    let oid = commit.oid.clone();
    let parent_oids = std::mem::take(&mut commit.parent_oids);

    let lane = active_lanes
        .iter()
        .position(|l| l.as_deref() == Some(oid.as_str()))
        .unwrap_or_else(|| {
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

    for l in active_lanes.iter_mut() {
        if l.as_deref() == Some(oid.as_str()) {
            *l = None;
        }
    }

    let mut edges = Vec::with_capacity(parent_oids.len());

    for (p_idx, parent_oid) in parent_oids.iter().enumerate() {
        let boundary = is_boundary(parent_oid, p_idx == 0);

        let target_lane = if p_idx == 0 {
            if !boundary {
                active_lanes[lane] = Some(parent_oid.clone());
            } else {
                active_lanes[lane] = None;
            }
            lane
        } else {
            let existing = active_lanes
                .iter()
                .position(|l| l.as_deref() == Some(parent_oid.as_str()));
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
                    if !boundary {
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

    commit.parent_oids = parent_oids;
    commit.edges = edges;
}

/// Key identifying one paginated graph "session" — a repo path plus the walk
/// parameters that change which commits are reachable at all.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct LaneCacheKey {
    path: String,
    first_parent: bool,
    hide_remotes: bool,
}

impl LaneCacheKey {
    pub fn path(&self) -> &str {
        &self.path
    }
}

/// Lane state carried across "load more" calls for one [`LaneCacheKey`].
pub struct LaneCacheEntry {
    /// Sorted `refname\toid` pairs for every ref in scope (HEAD + every
    /// branch/tag tip). Identical inputs make libgit2's topological walk
    /// deterministic, so an unchanged fingerprint means both the previously
    /// walked prefix and the ref labels attached to it are still exactly
    /// what a fresh walk would produce. Kept per-ref rather than deduped by
    /// target oid so that, say, tagging the current HEAD commit — a new ref
    /// pointing at an oid already in scope — still invalidates the cache;
    /// deduping by oid alone would miss it and serve a commit's cached refs
    /// without the new tag.
    fingerprint: Vec<String>,
    /// Commits walked so far, in walk order. Metadata fields are left empty
    /// (never needed once a commit has scrolled past the requested page) —
    /// only oid/parent_oids/lane/edges are kept.
    topo: Vec<GraphCommit>,
    active_lanes: Vec<Option<String>>,
    /// How many entries of `topo`, from the start, already have a final
    /// lane/edges assignment. Only the tail beyond this needs processing.
    lanes_assigned: usize,
}

pub type LaneCache = Mutex<HashMap<LaneCacheKey, LaneCacheEntry>>;

/// Build one page of the commit graph, reusing lane-assignment state cached
/// from previous pages of the same paginated session instead of recomputing
/// it from commit zero every time.
///
/// Falls back to the uncached [`build_graph_page`] when a path filter is
/// active — the scan-limit bookkeeping in the path-filtered walk doesn't line
/// up 1:1 with raw walk position, and file-history views don't page deep
/// enough for the cost to matter.
pub fn build_graph_page_cached(
    path: &str,
    skip: usize,
    max_commits: usize,
    first_parent: bool,
    hide_remotes: bool,
    path_filter: Option<&str>,
    cache: &LaneCache,
) -> Result<Vec<GraphCommit>, AppError> {
    if path_filter.is_some() {
        return build_graph_page(
            path,
            skip,
            max_commits,
            first_parent,
            hide_remotes,
            path_filter,
        );
    }

    let repo = Repository::open(path)?;
    let ref_map = build_ref_map(&repo, hide_remotes)?;

    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    if first_parent {
        let _ = revwalk.simplify_first_parent();
    }
    let _ = revwalk.push_head();

    let mut push_oids: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    let mut fingerprint: Vec<String> = Vec::new();
    if let Ok(head) = repo.head() {
        if let Some(oid) = head.target() {
            push_oids.insert(oid);
            fingerprint.push(format!("HEAD\t{oid}"));
        }
    }
    for r in repo.references()?.flatten() {
        let is_remote = r
            .name()
            .map(|n| n.starts_with("refs/remotes/"))
            .unwrap_or(false);
        if hide_remotes && is_remote {
            continue;
        }
        if let Ok(commit_ref) = r.peel(git2::ObjectType::Commit) {
            let oid = commit_ref.id();
            fingerprint.push(format!("{}\t{oid}", r.name().unwrap_or("")));
            if push_oids.insert(oid) {
                let _ = revwalk.push(oid);
            }
        }
    }
    fingerprint.sort_unstable();

    let key = LaneCacheKey {
        path: path.to_string(),
        first_parent,
        hide_remotes,
    };

    let mut cache = cache.lock();
    let mut entry = match cache.remove(&key) {
        Some(entry) if entry.fingerprint == fingerprint => entry,
        _ => LaneCacheEntry {
            fingerprint: fingerprint.clone(),
            topo: Vec::new(),
            active_lanes: Vec::new(),
            lanes_assigned: 0,
        },
    };

    let budget = skip.saturating_add(max_commits);

    // Fast-forward past the cached prefix: just confirm the walk still
    // yields the oids we already have, without touching the repo again.
    let mut walker = revwalk;
    let mut cache_valid = true;
    for cached in &entry.topo {
        match walker.next() {
            Some(Ok(oid)) if oid.to_string() == cached.oid => {}
            _ => {
                cache_valid = false;
                break;
            }
        }
    }
    if !cache_valid {
        entry = LaneCacheEntry {
            fingerprint,
            topo: Vec::new(),
            active_lanes: Vec::new(),
            lanes_assigned: 0,
        };
        // Rebuild the walker from scratch since the previous one was consumed
        // partway through an invalid fast-forward.
        let mut fresh = repo.revwalk()?;
        fresh.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
        if first_parent {
            let _ = fresh.simplify_first_parent();
        }
        let _ = fresh.push_head();
        for r in repo.references()?.flatten() {
            let is_remote = r
                .name()
                .map(|n| n.starts_with("refs/remotes/"))
                .unwrap_or(false);
            if hide_remotes && is_remote {
                continue;
            }
            if let Ok(commit_ref) = r.peel(git2::ObjectType::Commit) {
                let _ = fresh.push(commit_ref.id());
            }
        }
        walker = fresh;
    }

    // Extend the cached prefix up to `budget` with newly-walked commits.
    while entry.topo.len() < budget {
        let Some(oid_result) = walker.next() else {
            break;
        };
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;
        let oid_str = oid.to_string();
        let parent_oids: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();

        let idx = entry.topo.len();
        let include_fields = idx >= skip;
        let refs = if include_fields {
            ref_map.get(&oid_str).cloned().unwrap_or_default()
        } else {
            Vec::new()
        };
        let (message, author_name, author_email, author_date, committer_name, committer_date) =
            if include_fields {
                let author = commit.author();
                let committer = commit.committer();
                (
                    commit
                        .message()
                        .unwrap_or("")
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                    author.name().unwrap_or("").to_string(),
                    author.email().unwrap_or("").to_string(),
                    author.when().seconds(),
                    committer.name().unwrap_or("").to_string(),
                    committer.when().seconds(),
                )
            } else {
                (
                    String::new(),
                    String::new(),
                    String::new(),
                    0,
                    String::new(),
                    0,
                )
            };

        entry.topo.push(GraphCommit {
            short_oid: oid_str[..7.min(oid_str.len())].to_string(),
            oid: oid_str,
            message,
            author_name,
            author_email,
            author_date,
            committer_name,
            committer_date,
            parent_oids,
            refs,
            lane: 0,
            edges: Vec::new(),
        });
    }

    // Assign lanes only for the newly-appended tail; everything before it
    // keeps the lane state already recorded in the cache.
    //
    // Unlike `compute_lanes`'s whole-history-known walked_oids check, a
    // parent that hasn't been walked *yet* here might simply be on a page
    // that hasn't loaded — not actually outside the walk. Treating it as a
    // hard boundary would prematurely free its lane, so a later page's
    // commit would land in a different lane than the edge drawn for it
    // earlier promised, a visible discontinuity in the graph. Checking that
    // the object exists at all (vs. having been walked already) avoids that:
    // the lane stays reserved until the commit is actually reached, however
    // many pages later that is. Under first_parent mode, a non-first parent
    // is never walked at all (simplify_first_parent prunes it), so that one
    // case is still a genuine, permanent boundary.
    for commit in entry.topo[entry.lanes_assigned..].iter_mut() {
        assign_lane(commit, &mut entry.active_lanes, |parent_oid, is_first| {
            if first_parent && !is_first {
                return true;
            }
            match git2::Oid::from_str(parent_oid) {
                Ok(oid) => repo.find_commit(oid).is_err(),
                Err(_) => true,
            }
        });
    }
    entry.lanes_assigned = entry.topo.len();

    let result: Vec<GraphCommit> = entry
        .topo
        .iter()
        .skip(skip)
        .take(max_commits)
        .cloned()
        .collect();

    cache.insert(key, entry);

    Ok(result)
}
