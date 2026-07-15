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
pub fn build_graph(path: &str, max_commits: usize) -> Result<Vec<GraphCommit>, AppError> {
    let repo = Repository::open(path)?;

    // Collect refs for labeling
    let ref_map = build_ref_map(&repo)?;

    // Walk commits
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    let _ = revwalk.push_head();

    // Also push all branches/tags so we see the full graph
    for r in repo.references()?.flatten() {
        if let Ok(commit_ref) = r.peel(git2::ObjectType::Commit) {
            let _ = revwalk.push(commit_ref.id());
        }
    }

    let mut commits: Vec<GraphCommit> = Vec::new();

    for (i, oid_result) in revwalk.enumerate() {
        if i >= max_commits {
            break;
        }

        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        let parent_oids: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
        let refs = ref_map.get(&oid.to_string()).cloned().unwrap_or_default();

        let author = commit.author();
        let committer = commit.committer();

        commits.push(GraphCommit {
            oid: oid.to_string(),
            short_oid: oid.to_string()[..7.min(oid.to_string().len())].to_string(),
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

    // Assign lanes and edges
    compute_lanes(&mut commits);

    Ok(commits)
}

/// Build a map of oid -> ref labels.
fn build_ref_map(repo: &Repository) -> Result<HashMap<String, Vec<RefLabel>>, AppError> {
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
        let target_oid = match repo.find_object(oid, None).and_then(|obj| obj.peel(git2::ObjectType::Commit)) {
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
fn compute_lanes(commits: &mut [GraphCommit]) {
    if commits.is_empty() {
        return;
    }

    // Gather all walked commit OIDs to identify boundary commits without heap allocations
    let walked_oids: std::collections::HashSet<git2::Oid> =
        commits.iter().filter_map(|c| git2::Oid::from_str(&c.oid).ok()).collect();

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
            let parent_git_oid = git2::Oid::from_str(parent_oid).unwrap_or_else(|_| git2::Oid::zero());
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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_mock_commit(oid: &str, parent_oids: Vec<&str>) -> GraphCommit {
        GraphCommit {
            oid: oid.to_string(),
            short_oid: oid[..7.min(oid.len())].to_string(),
            message: "Commit message".to_string(),
            author_name: "Author".to_string(),
            author_email: "author@example.com".to_string(),
            author_date: 0,
            committer_name: "Committer".to_string(),
            committer_date: 0,
            parent_oids: parent_oids.into_iter().map(|s| s.to_string()).collect(),
            refs: Vec::new(),
            lane: 0,
            edges: Vec::new(),
        }
    }

    #[test]
    fn test_compute_lanes_single_line() {
        let mut commits = vec![
            create_mock_commit("C3", vec!["C2"]),
            create_mock_commit("C2", vec!["C1"]),
            create_mock_commit("C1", vec![]),
        ];

        compute_lanes(&mut commits);

        assert_eq!(commits[0].lane, 0);
        assert_eq!(commits[0].edges.len(), 1);
        assert_eq!(commits[0].edges[0].from_lane, 0);
        assert_eq!(commits[0].edges[0].to_lane, 0);
        assert_eq!(commits[0].edges[0].to_oid, "C2");

        assert_eq!(commits[1].lane, 0);
        assert_eq!(commits[1].edges.len(), 1);
        assert_eq!(commits[1].edges[0].from_lane, 0);
        assert_eq!(commits[1].edges[0].to_lane, 0);
        assert_eq!(commits[1].edges[0].to_oid, "C1");

        assert_eq!(commits[2].lane, 0);
        assert_eq!(commits[2].edges.len(), 0);
    }

    #[test]
    fn test_compute_lanes_branching() {
        let mut commits = vec![
            create_mock_commit("C4", vec!["C2"]),
            create_mock_commit("C3", vec!["C2"]),
            create_mock_commit("C2", vec!["C1"]),
            create_mock_commit("C1", vec![]),
        ];

        compute_lanes(&mut commits);

        assert_eq!(commits[0].oid, "C4");
        assert_eq!(commits[0].lane, 0);

        assert_eq!(commits[1].oid, "C3");
        assert_eq!(commits[1].lane, 1);

        assert_eq!(commits[2].oid, "C2");
        assert_eq!(commits[2].lane, 0);

        assert_eq!(commits[3].oid, "C1");
        assert_eq!(commits[3].lane, 0);
    }

    #[test]
    fn test_compute_lanes_boundary_commits() {
        // C2 has parent C1 which is not present in commits (boundary)
        let mut commits = vec![create_mock_commit("C2", vec!["C1"])];

        compute_lanes(&mut commits);

        assert_eq!(commits[0].lane, 0);
        assert_eq!(commits[0].edges.len(), 1);
        assert_eq!(commits[0].edges[0].to_lane, 0);
        assert_eq!(commits[0].edges[0].to_oid, "C1");

        // With optimization, C1 is boundary so its lane is cleared.
        // C4 (new branch) should be able to reuse lane 0 instead of allocating lane 1.
        let mut commits2 = vec![
            create_mock_commit("C2", vec!["C1"]),
            create_mock_commit("C4", vec!["C3"]),
        ];

        compute_lanes(&mut commits2);

        assert_eq!(commits2[0].oid, "C2");
        assert_eq!(commits2[0].lane, 0);

        assert_eq!(commits2[1].oid, "C4");
        assert_eq!(commits2[1].lane, 0);
    }

    #[test]
    fn test_build_graph_empty_repo() {
        let repo = crate::test_utils::TempRepo::new();
        let result = build_graph(repo.path_str(), 100);
        assert!(result.is_ok());
        let commits = result.unwrap();
        assert!(commits.is_empty());
    }
}
