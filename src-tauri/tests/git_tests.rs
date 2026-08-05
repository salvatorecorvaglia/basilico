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

/* ═══════════════════════════════════════════════════════
Pure helpers introduced alongside the correctness fixes
═══════════════════════════════════════════════════════ */

#[test]
fn test_split_grep_line_handles_colons_in_paths() {
    use basilico_lib::commands::search::split_grep_line;

    // Ordinary case.
    assert_eq!(
        split_grep_line("src/main.rs:42:fn main() {"),
        Some(("src/main.rs".to_string(), 42, "fn main() {".to_string()))
    );

    // Windows-style path: the drive colon must not be mistaken for the
    // separator.
    assert_eq!(
        split_grep_line(r"C:\repo\main.rs:7:let x = 1;"),
        Some((r"C:\repo\main.rs".to_string(), 7, "let x = 1;".to_string()))
    );

    // Colons inside the matched content must be preserved verbatim.
    assert_eq!(
        split_grep_line("a.txt:3:key: value: more"),
        Some(("a.txt".to_string(), 3, "key: value: more".to_string()))
    );

    // Lines that are not `path:line:content` are skipped.
    assert_eq!(split_grep_line("no separators here"), None);
    assert_eq!(split_grep_line("path:notanumber:content"), None);
}

#[test]
fn test_has_conflict_markers() {
    use basilico_lib::commands::conflict_resolver::has_conflict_markers;

    let unresolved = "a\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\nb\n";
    assert!(has_conflict_markers(unresolved));

    // Fully resolved content.
    assert!(!has_conflict_markers("a\nours\nb\n"));

    // A partial set of markers is not a conflict (and `=======` alone is a
    // perfectly ordinary underline in Markdown or reStructuredText).
    assert!(!has_conflict_markers("Heading\n=======\n"));

    // Markers must be at the start of a line to count.
    assert!(!has_conflict_markers(
        "note: <<<<<<< is a marker, ======= too, >>>>>>> as well"
    ));
}

#[test]
fn test_is_protected_branch() {
    use basilico_lib::commands::branch::is_protected_branch;

    // The sweep target itself, in local and remote-tracking form.
    assert!(is_protected_branch("main", "main"));
    assert!(is_protected_branch("origin/main", "main"));
    assert!(is_protected_branch("main", "origin/main"));

    // Well-known long-lived branches are protected regardless of target.
    assert!(is_protected_branch("master", "some-feature"));
    assert!(is_protected_branch("origin/develop", "some-feature"));
    assert!(is_protected_branch("trunk", "some-feature"));

    // Ordinary topic branches are sweepable.
    assert!(!is_protected_branch("feature/login", "main"));
    assert!(!is_protected_branch("origin/feature/login", "main"));

    // A branch merely *containing* a protected name is not protected.
    assert!(!is_protected_branch("mainline", "develop"));
    assert!(!is_protected_branch("feature/main-menu", "develop"));
}

#[test]
fn test_normalize_path_resolves_dot_segments() {
    use basilico_lib::commands::worktree::normalize_path;

    assert_eq!(
        normalize_path(Path::new("/a/b/../c")),
        Path::new("/a/c").to_path_buf()
    );
    assert_eq!(
        normalize_path(Path::new("/a/./b/")),
        Path::new("/a/b").to_path_buf()
    );
    assert_eq!(
        normalize_path(Path::new("/a/b/../../c")),
        Path::new("/c").to_path_buf()
    );
}

/* ═══════════════════════════════════════════════════════
SSH key inspection
═══════════════════════════════════════════════════════ */

/// Passphrase-protected keys must be detected so they can be skipped in favour
/// of the ssh-agent; handing an encrypted key to libgit2 with no passphrase
/// fails, and previously did so repeatedly with no useful message.
#[cfg(unix)]
#[test]
fn test_detects_passphrase_protected_ssh_keys() {
    use basilico_lib::git::credentials::key_is_encrypted_for_test as key_is_encrypted;

    let dir = std::env::temp_dir().join(format!("basilico-keys-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();

    let plain = dir.join("plain");
    let encrypted = dir.join("encrypted");

    let keygen = |path: &std::path::Path, passphrase: &str| {
        std::process::Command::new("ssh-keygen")
            .args([
                "-q",
                "-t",
                "ed25519",
                "-N",
                passphrase,
                "-C",
                "test",
                "-f",
                path.to_str().unwrap(),
            ])
            .status()
    };

    let plain_ok = keygen(&plain, "").map(|s| s.success()).unwrap_or(false);
    let enc_ok = keygen(&encrypted, "hunter2")
        .map(|s| s.success())
        .unwrap_or(false);

    if !plain_ok || !enc_ok {
        // ssh-keygen is unavailable on this machine; nothing to assert.
        std::fs::remove_dir_all(&dir).ok();
        return;
    }

    assert!(
        !key_is_encrypted(&plain),
        "an unencrypted key must be usable directly"
    );
    assert!(
        key_is_encrypted(&encrypted),
        "a passphrase-protected key must be recognised and skipped"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn test_key_encryption_detection_on_pem_headers() {
    use basilico_lib::git::credentials::key_is_encrypted_for_test as key_is_encrypted;

    let dir = std::env::temp_dir().join(format!("basilico-pem-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();

    // Legacy PEM keys advertise encryption in their headers.
    let legacy = dir.join("legacy");
    std::fs::write(
        &legacy,
        "-----BEGIN RSA PRIVATE KEY-----\n\
         Proc-Type: 4,ENCRYPTED\n\
         DEK-Info: AES-128-CBC,ABC123\n\n\
         base64stuff\n\
         -----END RSA PRIVATE KEY-----\n",
    )
    .unwrap();
    assert!(key_is_encrypted(&legacy));

    // A missing file is not a reason to skip; let libgit2 report the failure.
    assert!(!key_is_encrypted(&dir.join("does-not-exist")));

    std::fs::remove_dir_all(&dir).ok();
}

/* ═══════════════════════════════════════════════════════
natural_cmp — used to order branches and tags
═══════════════════════════════════════════════════════ */

#[test]
fn test_natural_cmp_orders_embedded_numbers_numerically() {
    use std::cmp::Ordering;

    // The whole point of natural ordering: v10 comes after v9, not before.
    assert_eq!(natural_cmp("v9", "v10"), Ordering::Less);
    assert_eq!(natural_cmp("v10", "v9"), Ordering::Greater);
    assert_eq!(natural_cmp("release-2", "release-10"), Ordering::Less);

    // Multi-segment versions compare segment by segment.
    assert_eq!(natural_cmp("v1.2.0", "v1.10.0"), Ordering::Less);
    assert_eq!(natural_cmp("v1.9.0", "v1.10.0"), Ordering::Less);

    // Identical strings are equal.
    assert_eq!(natural_cmp("main", "main"), Ordering::Equal);
    assert_eq!(natural_cmp("v1.0.0", "v1.0.0"), Ordering::Equal);

    // Pure text falls back to lexicographic order.
    assert_eq!(natural_cmp("alpha", "beta"), Ordering::Less);

    // A prefix sorts before the longer string that extends it.
    assert_eq!(natural_cmp("feat", "feature"), Ordering::Less);

    // Leading zeros compare by value, with the raw text breaking ties so the
    // ordering stays total rather than collapsing distinct names together.
    assert_ne!(natural_cmp("v007", "v7"), Ordering::Equal);
}

#[test]
fn test_natural_cmp_is_a_consistent_ordering() {
    // Sorting must be deterministic and antisymmetric, or the branch list will
    // reshuffle unpredictably between refreshes.
    let mut names = ["v2", "v10", "v1", "alpha", "v9", "beta", "v1.5"];
    names.sort_by(|a, b| natural_cmp(a, b));

    for pair in names.windows(2) {
        assert_ne!(
            natural_cmp(pair[0], pair[1]),
            std::cmp::Ordering::Greater,
            "sorted order violated between {:?} and {:?}",
            pair[0],
            pair[1]
        );
        // Antisymmetry.
        assert_eq!(
            natural_cmp(pair[0], pair[1]).reverse(),
            natural_cmp(pair[1], pair[0])
        );
    }
}

/* ═══════════════════════════════════════════════════════
parse_diff — binary files, renames, truncation
═══════════════════════════════════════════════════════ */

#[test]
fn test_parse_diff_flags_binary_files() {
    let repo = TempRepo::new();
    repo.write_file("readme.txt", "text\n");
    repo.commit("initial");

    // A NUL byte makes git treat the blob as binary.
    std::fs::write(repo.path.join("blob.bin"), [0u8, 1, 2, 3, 0, 255, 7]).unwrap();
    let mut index = repo.repo.index().unwrap();
    index.add_path(Path::new("blob.bin")).unwrap();
    index.write().unwrap();

    let staged = get_staged_diff(repo.path_str()).unwrap();
    let bin = staged
        .iter()
        .find(|f| f.new_path.as_deref() == Some("blob.bin"))
        .expect("binary file should appear in the diff");

    assert!(
        bin.is_binary,
        "binary content must be flagged, not rendered"
    );
    assert!(
        bin.hunks.is_empty(),
        "a binary file has no textual hunks to show"
    );
}

#[test]
fn test_parse_diff_truncates_very_large_files() {
    let repo = TempRepo::new();
    repo.write_file("big.txt", "");
    repo.commit("initial");

    // Comfortably past the 5000-line display cap.
    let huge: String = (0..7000).map(|i| format!("line {}\n", i)).collect();
    repo.write_file("big.txt", &huge);
    let mut index = repo.repo.index().unwrap();
    index.add_path(Path::new("big.txt")).unwrap();
    index.write().unwrap();

    let staged = get_staged_diff(repo.path_str()).unwrap();
    let big = staged
        .iter()
        .find(|f| f.new_path.as_deref() == Some("big.txt"))
        .expect("large file should appear in the diff");

    let truncated = big.hunks.iter().any(|h| h.header == "Truncated");
    assert!(
        truncated,
        "an oversized diff must be truncated rather than sent whole to the UI"
    );

    // Exactly one truncation marker, no matter how far past the cap we went.
    let markers = big.hunks.iter().filter(|h| h.header == "Truncated").count();
    assert_eq!(markers, 1, "truncation should be reported once");
}

#[test]
fn test_parse_diff_reports_added_and_deleted_counts() {
    let repo = TempRepo::new();
    repo.write_file("a.txt", "one\ntwo\nthree\n");
    repo.commit("initial");

    repo.write_file("a.txt", "one\nTWO\nthree\nfour\n");
    let mut index = repo.repo.index().unwrap();
    index.add_path(Path::new("a.txt")).unwrap();
    index.write().unwrap();

    let staged = get_staged_diff(repo.path_str()).unwrap();
    let f = staged
        .iter()
        .find(|f| f.new_path.as_deref() == Some("a.txt"))
        .unwrap();

    // One line changed (1 add + 1 delete) plus one appended line.
    assert_eq!(f.stats.additions, 2, "additions miscounted");
    assert_eq!(f.stats.deletions, 1, "deletions miscounted");
    assert_eq!(f.status, "modified");
}

/* ═══════════════════════════════════════════════════════
Path-filtered log
═══════════════════════════════════════════════════════ */

#[test]
fn test_path_filter_returns_only_commits_touching_the_path() {
    let repo = TempRepo::new();

    repo.write_file("a.txt", "a1");
    repo.commit("touch a");
    repo.write_file("b.txt", "b1");
    repo.commit("touch b");
    repo.write_file("a.txt", "a2");
    repo.commit("touch a again");
    repo.write_file("nested/deep/c.txt", "c1");
    repo.commit("touch nested c");

    let only_a = build_graph(repo.path_str(), 100, false, false, Some("a.txt")).unwrap();
    let messages: Vec<&str> = only_a.iter().map(|c| c.message.as_str()).collect();
    assert_eq!(messages, vec!["touch a again", "touch a"]);

    // A nested path is matched by its full path, not just its file name.
    let nested = build_graph(
        repo.path_str(),
        100,
        false,
        false,
        Some("nested/deep/c.txt"),
    )
    .unwrap();
    assert_eq!(nested.len(), 1);
    assert_eq!(nested[0].message, "touch nested c");

    // A path that never existed yields nothing rather than everything.
    let none = build_graph(repo.path_str(), 100, false, false, Some("missing.txt")).unwrap();
    assert!(none.is_empty());
}

#[test]
fn test_path_filter_includes_the_root_commit_that_introduced_the_file() {
    let repo = TempRepo::new();
    repo.write_file("first.txt", "hello");
    repo.commit("root commit");

    // The root commit has no parent; it still "touches" everything it contains.
    let filtered = build_graph(repo.path_str(), 100, false, false, Some("first.txt")).unwrap();
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].message, "root commit");
}

#[test]
fn test_path_filter_handles_deletions_and_pathspec_patterns() {
    let repo = TempRepo::new();
    repo.write_file("gone.txt", "here");
    repo.commit("add gone");
    repo.write_file("other.txt", "x");
    repo.commit("unrelated");
    repo.remove_file("gone.txt");
    repo.commit("delete gone");

    // Deleting a file is a change to that path.
    let filtered = build_graph(repo.path_str(), 100, false, false, Some("gone.txt")).unwrap();
    let messages: Vec<&str> = filtered.iter().map(|c| c.message.as_str()).collect();
    assert_eq!(messages, vec!["delete gone", "add gone"]);

    // Glob pathspecs take the general diff path and must still work.
    let globbed = build_graph(repo.path_str(), 100, false, false, Some("*.txt")).unwrap();
    assert!(
        globbed.len() >= 3,
        "glob pathspec should match all three commits"
    );
}

#[test]
fn test_paginated_graph_matches_the_unpaginated_result() {
    let repo = TempRepo::new();
    for i in 0..25 {
        repo.write_file(&format!("f{}.txt", i), &format!("v{}", i));
        repo.commit(&format!("commit {}", i));
    }

    let whole = build_graph(repo.path_str(), 100, false, false, None).unwrap();
    assert_eq!(whole.len(), 25);

    // Pages must reassemble into exactly the same sequence, lanes included —
    // lane assignment is a forward pass, so a page cannot be computed in
    // isolation without drifting from what is already on screen.
    let mut assembled = Vec::new();
    for page in 0..3 {
        let chunk = build_graph_page(repo.path_str(), page * 10, 10, false, false, None).unwrap();
        assembled.extend(chunk);
    }

    assert_eq!(assembled.len(), whole.len());
    for (got, want) in assembled.iter().zip(whole.iter()) {
        assert_eq!(got.oid, want.oid);
        assert_eq!(got.message, want.message);
        assert_eq!(got.lane, want.lane, "lane drifted for {}", got.oid);
        assert_eq!(got.author_name, want.author_name);
        assert_eq!(got.parent_oids, want.parent_oids);
    }
}

#[test]
fn test_paginated_graph_preserves_lanes_across_a_merge() {
    let repo = TempRepo::new();
    repo.write_file("base.txt", "base");
    repo.commit("base");
    let base = repo.repo.head().unwrap().target().unwrap();

    // A branch and a merge give the lane allocator something non-trivial to do.
    repo.write_file("side.txt", "side");
    repo.commit("side work");
    let side = repo.repo.head().unwrap().target().unwrap();

    repo.repo.set_head_detached(base).unwrap();
    repo.write_file("main.txt", "main");
    repo.commit("main work");

    let head = repo.repo.head().unwrap().peel_to_commit().unwrap();
    let side_commit = repo.repo.find_commit(side).unwrap();
    let sig = repo.repo.signature().unwrap();
    let tree = head.tree().unwrap();
    repo.repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "merge side",
            &tree,
            &[&head, &side_commit],
        )
        .unwrap();

    let whole = build_graph(repo.path_str(), 100, false, false, None).unwrap();
    let mut assembled = Vec::new();
    for page in 0..whole.len().div_ceil(2) {
        assembled
            .extend(build_graph_page(repo.path_str(), page * 2, 2, false, false, None).unwrap());
    }

    assert_eq!(assembled.len(), whole.len());
    for (got, want) in assembled.iter().zip(whole.iter()) {
        assert_eq!(got.oid, want.oid);
        assert_eq!(got.lane, want.lane, "lane drifted for {}", got.oid);
        assert_eq!(got.edges.len(), want.edges.len());
    }
}
