/* ═══════════════════════════════════════════════════════
Basilico — Git Engine Unit Tests
═══════════════════════════════════════════════════════ */

use basilico_lib::git::diff_parser::*;
use basilico_lib::git::graph::*;
use basilico_lib::git::repository::*;
use basilico_lib::git::utils::*;
use basilico_lib::test_utils::TempRepo;
use git2::Repository;
use std::path::Path;

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
fn test_empty_repo_diffs() {
    let repo = TempRepo::new();

    let staged = get_staged_diff(repo.path_str()).unwrap();
    assert!(staged.is_empty());

    let workdir = get_workdir_diff(repo.path_str()).unwrap();
    assert!(workdir.is_empty());
}

#[test]
fn test_workdir_and_staged_diff_parsing() {
    let repo = TempRepo::new();
    repo.write_file("test.txt", "hello world\nline2\n");

    let workdir = get_workdir_diff(repo.path_str()).unwrap();
    assert_eq!(workdir.len(), 1);
    assert_eq!(workdir[0].new_path.as_deref(), Some("test.txt"));
    assert_eq!(workdir[0].status, "untracked");
    assert_eq!(workdir[0].stats.additions, 0);

    let git_repo = Repository::open(repo.path_str()).unwrap();
    let mut index = git_repo.index().unwrap();
    index.add_path(Path::new("test.txt")).unwrap();
    index.write().unwrap();

    let staged = get_staged_diff(repo.path_str()).unwrap();
    assert_eq!(staged.len(), 1);
    assert_eq!(staged[0].new_path.as_deref(), Some("test.txt"));
    assert_eq!(staged[0].status, "added");
    assert_eq!(staged[0].stats.additions, 2);

    repo.write_file("test.txt", "hello world\nline2\nline3\n");
    let workdir2 = get_workdir_diff(repo.path_str()).unwrap();
    assert_eq!(workdir2.len(), 1);
    assert_eq!(workdir2[0].status, "modified");
    assert_eq!(workdir2[0].stats.additions, 1);
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
    let mut commits = vec![create_mock_commit("C2", vec!["C1"])];

    compute_lanes(&mut commits);

    assert_eq!(commits[0].lane, 0);
    assert_eq!(commits[0].edges.len(), 1);
    assert_eq!(commits[0].edges[0].to_lane, 0);
    assert_eq!(commits[0].edges[0].to_oid, "C1");

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
    let repo = TempRepo::new();
    let result = build_graph(repo.path_str(), 100, false, false, None);
    assert!(result.is_ok());
    let commits = result.unwrap();
    assert!(commits.is_empty());
}

#[test]
fn test_open_repo_and_status() {
    let repo = TempRepo::new();
    repo.write_file("hello.txt", "hello world");
    repo.commit("initial commit");

    let info = open_repo(repo.path_str()).expect("open_repo failed");
    assert!(!info.is_bare);
    assert!(!info.is_empty);

    let status = get_status(repo.path_str()).expect("get_status failed");
    assert!(status.staged.is_empty());
    assert!(status.unstaged.is_empty());
    assert!(status.untracked.is_empty());
}

#[test]
fn test_list_branches() {
    let repo = TempRepo::new();
    repo.write_file("main.rs", "fn main() {}");
    repo.commit("first commit");

    let branches = list_branches(repo.path_str()).expect("list_branches failed");
    assert!(!branches.is_empty());
    let head_branch = branches.iter().find(|b| b.is_head);
    assert!(head_branch.is_some());
}

#[test]
fn test_validate_path_safe() {
    let base = Path::new("/tmp/repo");
    let safe = Path::new("src/main.rs");
    assert!(validate_path(base, safe).is_ok());
}

#[test]
fn test_validate_path_traversal() {
    let base = Path::new("/tmp/repo");
    let unsafe_path = Path::new("../etc/passwd");
    assert!(validate_path(base, unsafe_path).is_err());
}

#[test]
fn test_validate_relative_path() {
    assert!(validate_relative_path("foo/bar.txt").is_ok());
    assert!(validate_relative_path("../foo").is_err());
    assert!(validate_relative_path("/abs/path").is_err());
}

#[test]
fn test_validate_repo_path() {
    assert!(validate_repo_path("/nonexistent/directory/path/12345").is_err());
    assert!(validate_repo_path(".").is_ok());
}
